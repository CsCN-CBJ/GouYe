-- 记账软件数据库表结构
CREATE DATABASE IF NOT EXISTS gouye
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE gouye;

-- 1. 用户表
CREATE TABLE users (
    user_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 2. 分类表
CREATE TABLE categories (
    category_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT COMMENT '用户ID,NULL表示系统默认分类',
    category_name VARCHAR(50) NOT NULL,
    category_type ENUM('income', 'expense') NOT NULL COMMENT '收入/支出',
    icon VARCHAR(50) COMMENT '图标标识',
    color VARCHAR(20) COMMENT '颜色标识',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 3. 流水表
CREATE TABLE transactions (
    transaction_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL COMMENT '金额',
    transaction_type ENUM('income', 'expense') NOT NULL,
    transaction_date DATETIME NOT NULL COMMENT '交易时间',
    description VARCHAR(255) COMMENT '备注说明',
    images TEXT COMMENT '附件图片',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    INDEX idx_user_date (user_id, transaction_date),
    INDEX idx_category (category_id),
    INDEX idx_type (transaction_type)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 4. 标签表
CREATE TABLE tags (
    tag_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    tag_name VARCHAR(30) NOT NULL,
    color VARCHAR(20) COMMENT '标签颜色',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    UNIQUE KEY uk_user_tag (user_id, tag_name)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 5. 流水标签关联表
CREATE TABLE transaction_tags (
    transaction_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    PRIMARY KEY (transaction_id, tag_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
