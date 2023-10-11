/*
  Warnings:

  - You are about to drop the column `amount` on the `Account` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Account" DROP COLUMN "amount",
ADD COLUMN     "balance" INTEGER NOT NULL DEFAULT 0;
