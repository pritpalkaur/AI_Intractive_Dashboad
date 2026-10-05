-- Adds the "update flag" columns to dbo.Products and creates dbo.DashboardUsers and dbo.PasswordResets. Safe to run more than once.
IF COL_LENGTH('dbo.Products', 'IsUpdated') IS NULL
  ALTER TABLE dbo.Products ADD IsUpdated BIT NOT NULL CONSTRAINT DF_Products_IsUpdated DEFAULT 0;

IF COL_LENGTH('dbo.Products', 'UpdatedAt') IS NULL
  ALTER TABLE dbo.Products ADD UpdatedAt DATETIME2 NULL;

-- Login accounts for this dashboard (separate from any existing dbo.Users table). Passwords are stored as bcrypt hashes.
IF OBJECT_ID('dbo.DashboardUsers', 'U') IS NULL
  CREATE TABLE dbo.DashboardUsers (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DashboardUsers PRIMARY KEY,
    Email NVARCHAR(254) NOT NULL CONSTRAINT UQ_DashboardUsers_Email UNIQUE,
    Name NVARCHAR(100) NOT NULL,
    PasswordHash NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_DashboardUsers_CreatedAt DEFAULT SYSUTCDATETIME()
  );

-- One-time password reset links. Only a SHA-256 hash of the token is stored.
IF OBJECT_ID('dbo.PasswordResets', 'U') IS NULL
  CREATE TABLE dbo.PasswordResets (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PasswordResets PRIMARY KEY,
    UserId INT NOT NULL CONSTRAINT FK_PasswordResets_DashboardUsers REFERENCES dbo.DashboardUsers(Id) ON DELETE CASCADE,
    TokenHash CHAR(64) NOT NULL CONSTRAINT UQ_PasswordResets_TokenHash UNIQUE,
    ExpiresAt DATETIME2 NOT NULL,
    UsedAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_PasswordResets_CreatedAt DEFAULT SYSUTCDATETIME()
  );
