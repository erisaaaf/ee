-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Food" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "localNames" JSONB,
    "brand" TEXT,
    "barcode" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "category" TEXT,
    "region" TEXT,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "dataQuality" TEXT NOT NULL,
    "servingG" REAL NOT NULL DEFAULT 100,
    "servingLabel" TEXT NOT NULL DEFAULT '100 g',
    "isLiquid" BOOLEAN NOT NULL DEFAULT false,
    "kcal" REAL,
    "proteinG" REAL,
    "carbsG" REAL,
    "fatG" REAL,
    "fiberG" REAL,
    "sugarG" REAL,
    "sodiumMg" REAL,
    "ironMg" REAL,
    "calciumMg" REAL,
    "potassiumMg" REAL,
    "magnesiumMg" REAL,
    "vitAUg" REAL,
    "vitCMg" REAL,
    "vitDUg" REAL,
    "vitB12Ug" REAL,
    "folateUg" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Food_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Food" ("barcode", "brand", "calciumMg", "carbsG", "category", "createdAt", "dataQuality", "deletedAt", "fatG", "fiberG", "folateUg", "id", "ironMg", "isLiquid", "kcal", "localNames", "magnesiumMg", "name", "ownerId", "potassiumMg", "proteinG", "region", "servingG", "servingLabel", "sodiumMg", "source", "sourceRef", "sugarG", "updatedAt", "vitAUg", "vitB12Ug", "vitCMg", "vitDUg") SELECT "barcode", "brand", "calciumMg", "carbsG", "category", "createdAt", "dataQuality", "deletedAt", "fatG", "fiberG", "folateUg", "id", "ironMg", "isLiquid", "kcal", "localNames", "magnesiumMg", "name", "ownerId", "potassiumMg", "proteinG", "region", "servingG", "servingLabel", "sodiumMg", "source", "sourceRef", "sugarG", "updatedAt", "vitAUg", "vitB12Ug", "vitCMg", "vitDUg" FROM "Food";
DROP TABLE "Food";
ALTER TABLE "new_Food" RENAME TO "Food";
CREATE INDEX "Food_searchText_idx" ON "Food"("searchText");
CREATE INDEX "Food_barcode_idx" ON "Food"("barcode");
CREATE INDEX "Food_ownerId_idx" ON "Food"("ownerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
