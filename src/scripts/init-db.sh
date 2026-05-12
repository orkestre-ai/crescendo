#!/bin/bash

# Database Initialization Script for Crescendo
# This script automates the complete database setup process

set -e  # Exit on error

# Load shared print helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/print.sh
source "$SCRIPT_DIR/lib/print.sh"

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo "  Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
        exit 1
    fi
    print_success "Docker is installed"

    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        echo "  Docker Compose should come with Docker Desktop"
        echo "  If using Linux, install it separately: https://docs.docker.com/compose/install"
        exit 1
    fi
    print_success "Docker Compose is installed"

    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        echo "  Please start Docker Desktop"
        exit 1
    fi
    print_success "Docker daemon is running"

    # Check if .env.local exists
    if [ ! -f ".env.local" ]; then
        print_warning ".env.local file not found"
        echo ""
        echo "  You need to create .env.local with your API credentials."
        echo "  Follow the guide: docs/CREDENTIAL-SETUP-GUIDE.md"
        echo ""
        read -p "Do you want to continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Exiting. Please create .env.local and try again."
            exit 1
        fi
    else
        print_success ".env.local file exists"
    fi
}

# Start Docker containers
start_containers() {
    print_header "Starting Docker Containers"

    print_info "Starting PostgreSQL and pgAdmin..."
    docker-compose up -d

    if [ $? -eq 0 ]; then
        print_success "Docker containers started"
    else
        print_error "Failed to start Docker containers"
        exit 1
    fi
}

# Wait for PostgreSQL to be ready
wait_for_postgres() {
    print_header "Waiting for PostgreSQL"

    print_info "Waiting for PostgreSQL to be healthy..."

    MAX_ATTEMPTS=30
    ATTEMPT=0

    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        if docker exec crescendo-db pg_isready -U postgres &> /dev/null; then
            print_success "PostgreSQL is ready"
            return 0
        fi

        ATTEMPT=$((ATTEMPT + 1))
        echo -n "."
        sleep 1
    done

    echo ""
    print_error "PostgreSQL failed to become ready after ${MAX_ATTEMPTS} seconds"
    echo "  Check logs with: docker-compose logs postgres"
    exit 1
}

# Generate Prisma Client
generate_prisma() {
    print_header "Generating Prisma Client"

    print_info "Running: npx prisma generate"
    npx prisma generate

    if [ $? -eq 0 ]; then
        print_success "Prisma Client generated"
    else
        print_error "Failed to generate Prisma Client"
        exit 1
    fi
}

# Run database migrations
run_migrations() {
    print_header "Running Database Migrations"

    print_info "Running: npx prisma migrate deploy"
    npx prisma migrate deploy

    if [ $? -eq 0 ]; then
        print_success "Database migrations completed"
    else
        print_error "Failed to run migrations"
        exit 1
    fi
}

# Optional: Seed database
seed_database() {
    print_header "Seeding Database (Optional)"

    echo ""
    echo "Do you want to seed the database with sample data?"
    echo "This will create:"
    echo "  - 3 sample fundraising pages"
    echo "  - 30 days of performance snapshots for each page"
    echo "  - 5 sample AI recommendations"
    echo "  - 1 completed collection job"
    echo ""
    read -p "Seed database? (Y/n) " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        print_info "Running: npx prisma db seed"
        npx prisma db seed

        if [ $? -eq 0 ]; then
            print_success "Database seeded with sample data"
        else
            print_warning "Seeding failed, but you can continue"
            echo "  You can run 'npx prisma db seed' manually later"
        fi
    else
        print_info "Skipping database seed"
    fi
}

# Display connection information
show_connection_info() {
    print_header "Connection Information"

    echo ""
    echo -e "${GREEN}✓ Database Setup Complete!${NC}"
    echo ""
    echo "PostgreSQL Connection:"
    echo "  Host: localhost"
    echo "  Port: 54320"
    echo "  Database: crescendo"
    echo "  User: postgres"
    echo "  Password: postgres"
    echo ""
    echo "Connection String:"
    echo "  postgresql://postgres:postgres@localhost:54320/crescendo"
    echo ""
}

# Display next steps
show_next_steps() {
    print_header "Next Steps"

    echo ""
    echo "1. Verify database connection:"
    echo "   docker exec -it crescendo-db psql -U postgres -d crescendo"
    echo ""
    echo "2. Open pgAdmin (if needed):"
    echo "   http://localhost:5050"
    echo ""
    echo "3. Start development server:"
    echo "   npm run dev"
    echo ""
    echo "4. Trigger data collection (optional):"
    echo "   Open http://localhost:3000 and click 'Refresh Data'"
    echo ""
    echo "Useful commands:"
    echo "  - View logs: docker-compose logs -f"
    echo "  - Stop database: docker-compose stop"
    echo "  - Start database: docker-compose start"
    echo "  - Remove all data: docker-compose down -v"
    echo ""
}

# Main execution
main() {
    clear

    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                        ║${NC}"
    echo -e "${BLUE}║  Crescendo Database Setup Script      ║${NC}"
    echo -e "${BLUE}║                                        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""

    check_prerequisites
    start_containers
    wait_for_postgres
    generate_prisma
    run_migrations
    seed_database
    show_connection_info
    show_next_steps

    echo ""
    print_success "Setup complete! Happy coding! 🚀"
    echo ""
}

# Run main function
main
