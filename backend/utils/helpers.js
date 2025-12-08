// utils/helpers.js
import fs from 'fs';
import path from 'path';

export class FileHelper {
  static ensureDirectoryExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  static readJSONFile(filePath, defaultValue = null) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
      return defaultValue;
    } catch (error) {
      console.warn(`⚠️ Could not read JSON file ${filePath}:`, error.message);
      return defaultValue;
    }
  }

  static writeJSONFile(filePath, data) {
    try {
      this.ensureDirectoryExists(filePath);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error(`❌ Could not write JSON file ${filePath}:`, error.message);
      return false;
    }
  }

  static deleteFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`❌ Could not delete file ${filePath}:`, error.message);
      return false;
    }
  }
}

export class ValidationHelper {
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidDocumentStatus(status) {
    return ['draft', 'published', 'archived'].includes(status);
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
  }

  static validateDocumentData(data) {
    const errors = [];
    
    if (!data.title || data.title.trim().length === 0) {
      errors.push('Title is required');
    }
    
    if (!data.subcategory_id || isNaN(data.subcategory_id)) {
      errors.push('Valid subcategory ID is required');
    }
    
    if (!data.content || (typeof data.content === 'string' && data.content.trim().length === 0)) {
      errors.push('Content is required');
    }
    
    if (data.status && !this.isValidDocumentStatus(data.status)) {
      errors.push('Invalid status');
    }
    
    return errors;
  }
}

export class ResponseHelper {
  static success(data = null, message = 'Success') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  static error(message = 'Error', details = null, code = 500) {
    return {
      success: false,
      message,
      details,
      code,
      timestamp: new Date().toISOString()
    };
  }

  static paginate(data, page, limit, total) {
    return {
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

export class DateHelper {
  static formatDate(date) {
    return new Date(date).toISOString().split('T')[0];
  }

  static formatDateTime(date) {
    return new Date(date).toISOString().replace('T', ' ').substring(0, 19);
  }

  static getDateRange(timeframe) {
    const now = new Date();
    switch (timeframe) {
      case 'daily':
        return new Date(now.setHours(0, 0, 0, 0));
      case 'weekly':
        return new Date(now.setDate(now.getDate() - 7));
      case 'monthly':
        return new Date(now.setMonth(now.getMonth() - 1));
      case 'yearly':
        return new Date(now.setFullYear(now.getFullYear() - 1));
      default:
        return new Date(0); // Beginning of time
    }
  }
}