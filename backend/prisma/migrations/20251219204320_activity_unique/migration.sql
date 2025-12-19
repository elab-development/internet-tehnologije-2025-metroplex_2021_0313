/*
  Warnings:

  - A unique constraint covering the columns `[destination,name]` on the table `Activity` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Activity_destination_name_key" ON "Activity"("destination", "name");
