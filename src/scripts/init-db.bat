@echo off
setlocal enabledelayedexpansion

REM Database Initialization Script for Crescendo (Windows)
REM This script automates the complete database setup process

echo.
echo ======================================
echo   Crescendo Database Setup
echo ======================================
echo.

REM Check if Docker is installed
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop
    exit /b 1
)
echo [OK] Docker is installed

REM Check if Docker Compose is installed
where docker-compose >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker Compose is not installed
    echo Docker Compose should come with Docker Desktop
    exit /b 1
)
echo [OK] Docker Compose is installed

REM Check if Docker daemon is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker daemon is not running
    echo Please start Docker Desktop
    exit /b 1
)
echo [OK] Docker daemon is running

REM Check if .env.local exists
if not exist ".env.local" (
    echo [WARNING] .env.local file not found
    echo.
    echo You need to create .env.local with your API credentials.
    echo Follow the guide: docs\CREDENTIAL-SETUP-GUIDE.md
    echo.
    set /p continue="Do you want to continue anyway? (y/N) "
    if /i not "!continue!"=="y" (
        echo Exiting. Please create .env.local and try again.
        exit /b 1
    )
) else (
    echo [OK] .env.local file exists
)

echo.
echo ======================================
echo   Starting Docker Containers
echo ======================================
echo.

echo Starting PostgreSQL and pgAdmin...
docker-compose up -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start Docker containers
    exit /b 1
)
echo [OK] Docker containers started

echo.
echo ======================================
echo   Waiting for PostgreSQL
echo ======================================
echo.

echo Waiting for PostgreSQL to be ready...
set attempts=0
:wait_loop
docker exec crescendo-db pg_isready -U postgres >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] PostgreSQL is ready
    goto postgres_ready
)

set /a attempts+=1
if %attempts% geq 30 (
    echo [ERROR] PostgreSQL failed to become ready after 30 seconds
    echo Check logs with: docker-compose logs postgres
    exit /b 1
)

timeout /t 1 /nobreak >nul
goto wait_loop

:postgres_ready

echo.
echo ======================================
echo   Generating Prisma Client
echo ======================================
echo.

echo Running: npx prisma generate
call npx prisma generate
if %errorlevel% neq 0 (
    echo [ERROR] Failed to generate Prisma Client
    exit /b 1
)
echo [OK] Prisma Client generated

echo.
echo ======================================
echo   Running Database Migrations
echo ======================================
echo.

echo Running: npx prisma migrate dev --name init
call npx prisma migrate dev --name init
if %errorlevel% neq 0 (
    echo [ERROR] Failed to run migrations
    exit /b 1
)
echo [OK] Database migrations completed

echo.
echo ======================================
echo   Seeding Database (Optional)
echo ======================================
echo.

echo Do you want to seed the database with sample data?
echo This will create:
echo   - 3 sample fundraising pages
echo   - 30 days of performance snapshots for each page
echo   - 5 sample AI recommendations
echo   - 1 completed collection job
echo.
set /p seed="Seed database? (Y/n) "
if /i not "!seed!"=="n" (
    echo Running: npx prisma db seed
    call npx prisma db seed
    if %errorlevel% equ 0 (
        echo [OK] Database seeded with sample data
    ) else (
        echo [WARNING] Seeding failed, but you can continue
        echo You can run 'npx prisma db seed' manually later
    )
) else (
    echo [INFO] Skipping database seed
)

echo.
echo ======================================
echo   Connection Information
echo ======================================
echo.

echo [OK] Database Setup Complete!
echo.
echo PostgreSQL Connection:
echo   Host: localhost
echo   Port: 5432
echo   Database: crescendo
echo   User: postgres
echo   Password: postgres
echo.
echo pgAdmin Web Interface:
echo   URL: http://localhost:5050
echo   Email: admin@localhost.com
echo   Password: admin
echo.
echo Connection String:
echo   postgresql://postgres:postgres@localhost:5432/crescendo
echo.

echo.
echo ======================================
echo   Next Steps
echo ======================================
echo.

echo 1. Verify database connection:
echo    docker exec -it crescendo-db psql -U postgres -d crescendo
echo.
echo 2. Open pgAdmin (if needed):
echo    http://localhost:5050
echo.
echo 3. Start development server:
echo    npm run dev
echo.
echo 4. Trigger data collection (optional):
echo    Open http://localhost:3000 and click 'Refresh Data'
echo.
echo Useful commands:
echo   - View logs: docker-compose logs -f
echo   - Stop database: docker-compose stop
echo   - Start database: docker-compose start
echo   - Remove all data: docker-compose down -v
echo.

echo [OK] Setup complete! Happy coding!
echo.

pause
