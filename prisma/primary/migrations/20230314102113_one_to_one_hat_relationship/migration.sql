-- CreateTable
CREATE TABLE "Hat" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,

    CONSTRAINT "Hat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hat_userId_key" ON "Hat"("userId");

-- AddForeignKey
ALTER TABLE "Hat" ADD CONSTRAINT "Hat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
