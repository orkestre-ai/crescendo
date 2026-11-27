-- One day of giving on one page, from the Engaging Networks fundraising
-- summary. A row of zeros means the day was fetched and nothing came in.
CREATE TABLE "EnDailyGiving" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "donationCount" INTEGER NOT NULL,
    "singleAmount" DOUBLE PRECISION NOT NULL,
    "singleCount" INTEGER NOT NULL,
    "recurringAmount" DOUBLE PRECISION NOT NULL,
    "recurringCount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnDailyGiving_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnDailyGiving_date_idx" ON "EnDailyGiving"("date");

CREATE UNIQUE INDEX "EnDailyGiving_pageId_date_key" ON "EnDailyGiving"("pageId", "date");

ALTER TABLE "EnDailyGiving" ADD CONSTRAINT "EnDailyGiving_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "FundraisingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
