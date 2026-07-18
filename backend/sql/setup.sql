-- Aryan Tech Zone Database Setup
-- Run this script in SQL Server Management Studio (SSMS)

-- Create database
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'AryanTechZone')
BEGIN
    CREATE DATABASE AryanTechZone;
END
GO

USE AryanTechZone;
GO

-- Work Requests table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WorkRequests' AND xtype='U')
BEGIN
    CREATE TABLE WorkRequests (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        OrderId NVARCHAR(50) NOT NULL UNIQUE,
        ClientName NVARCHAR(100) NOT NULL,
        ClientEmail NVARCHAR(150) NOT NULL,
        ClientPhone NVARCHAR(20) NOT NULL,
        ServiceType NVARCHAR(100) NOT NULL,
        ProjectTitle NVARCHAR(200) NOT NULL,
        ProjectDescription NVARCHAR(MAX) NOT NULL,
        Budget DECIMAL(10,2) NOT NULL,
        Deadline DATE NULL,
        Status NVARCHAR(50) DEFAULT 'Pending Payment',
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        UpdatedAt DATETIME2 DEFAULT GETDATE()
    );
END
GO

-- Payments table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Payments' AND xtype='U')
BEGIN
    CREATE TABLE Payments (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        OrderId NVARCHAR(50) NOT NULL,
        TransactionId NVARCHAR(100) NOT NULL,
        Amount DECIMAL(10,2) NOT NULL,
        UpiNumber NVARCHAR(20) NOT NULL,
        PaymentNote NVARCHAR(500) NULL,
        PaymentStatus NVARCHAR(50) DEFAULT 'Confirmed',
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (OrderId) REFERENCES WorkRequests(OrderId)
    );
END
GO

-- Index for faster lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WorkRequests_OrderId')
BEGIN
    CREATE INDEX IX_WorkRequests_OrderId ON WorkRequests(OrderId);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Payments_OrderId')
BEGIN
    CREATE INDEX IX_Payments_OrderId ON Payments(OrderId);
END
GO

PRINT 'Aryan Tech Zone database setup completed successfully!';
