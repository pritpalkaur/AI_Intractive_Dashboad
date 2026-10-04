-- Adds the "update flag" columns to dbo.Products and creates dbo.Users. Safe to run more than once.
IF COL_LENGTH('dbo.Products', 'IsUpdated') IS NULL
  ALTER TABLE dbo.Products ADD IsUpdated BIT NOT NULL CONSTRAINT DF_Products_IsUpdated DEFAULT 0;

IF COL_LENGTH('dbo.Products', 'UpdatedAt') IS NULL
  ALTER TABLE dbo.Products ADD UpdatedAt DATETIME2 NULL;

-- Login accounts for JWT authentication. Passwords are stored as bcrypt hashes.
IF OBJECT_ID('dbo.Users', 'U') IS NULL
  CREATE TABLE dbo.Users (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    Email NVARCHAR(254) NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
    Name NVARCHAR(100) NOT NULL,
    PasswordHash NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME()
  );
