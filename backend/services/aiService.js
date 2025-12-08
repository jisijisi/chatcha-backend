// services/aiService.js - FIXED: Proper Full Access Handling
import fetch from 'node-fetch';
import { fetchCompanyInfo } from './wikipediaService.js';
import { pool } from '../config/database.js';

// Helper function to get user permissions from database
async function getUserPermissions(userEmail) {
    if (!userEmail) {
        console.log("⚠️ No user email provided - GUEST USER MODE");
        // Return null for guest users (NO ACCESS to internal documents)
        return null;
    }

    try {
        // Get employee ID
        const [employee] = await pool.execute(
            'SELECT id FROM employees WHERE email = ? AND is_active = TRUE',
            [userEmail]
        );
        
        if (employee.length === 0) {
            console.log(`⚠️ No active employee found for ${userEmail} - treating as GUEST`);
            // Return null for unrecognized emails (NO ACCESS)
            return null;
        }
        
        const employeeId = employee[0].id;
        
        // Get permissions - CRITICAL: Include full access detection
        const [permissions] = await pool.execute(`
            SELECT 
                category_id, 
                subcategory_id, 
                source_id,
                -- Detect full access: when all IDs are null
                (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL) as has_full_access
            FROM employee_access_permissions 
            WHERE employee_id = ?
        `, [employeeId]);
        
        console.log(`🔐 Loaded ${permissions.length} permissions for ${userEmail} (Employee ID: ${employeeId})`);
        
        // Check for full access permission
        const hasFullAccess = permissions.some(p => p.has_full_access);
        
        if (hasFullAccess) {
            console.log("   ✅ User has FULL ACCESS to all documents");
            // Return special marker for full access
            return 'FULL_ACCESS';
        }
        
        // Log permission details for debugging
        if (permissions.length > 0) {
            const categoryPerms = permissions.filter(p => p.category_id && !p.subcategory_id);
            const subcategoryPerms = permissions.filter(p => p.subcategory_id);
            const sourcePerms = permissions.filter(p => p.source_id);
            
            console.log(`   📁 Category-level permissions: ${categoryPerms.length}`);
            console.log(`   📂 Subcategory-level permissions: ${subcategoryPerms.length}`);
            console.log(`   🔧 Source-level permissions: ${sourcePerms.length}`);
        } else {
            console.log("   ⚠️ No permissions assigned - user will have NO ACCESS to internal documents");
            return []; // Empty array = no permissions
        }
        
        return permissions;
        
    } catch (error) {
        console.error('❌ Error loading user permissions:', error);
        // On error, return null (NO ACCESS)
        return null;
    }
}

// Main function to get enhanced context with RAG and Wikipedia
export async function getEnhancedContext(question, ragSystem, topK = 20, userEmail = null) {
    const lowerQuestion = question.toLowerCase();
    const companyKeywords = ['cdo', 'foodsphere', 'company', 'history', 'founder', 'about', 'background', 'corporate', 'when was', 'who founded', 'president'];
    const isCompanyQuestion = companyKeywords.some(keyword => 
        lowerQuestion.includes(keyword)
    );
    
    // === Get user permissions ===
    let userPermissions = null;
    const isGuest = !userEmail;
    
    if (isGuest) {
        console.log("🚫 GUEST USER - No access to internal documents");
        userPermissions = null;
    } else {
        console.log(`🔑 Fetching permissions for user: ${userEmail}`);
        userPermissions = await getUserPermissions(userEmail);
        
        // Handle permission results
        if (userPermissions === null) {
            console.log("🚫 User not found or error - treating as GUEST");
        } else if (userPermissions === 'FULL_ACCESS') {
            console.log("🎯 User has FULL ACCESS - bypassing permission checks");
        } else if (Array.isArray(userPermissions) && userPermissions.length === 0) {
            console.log("🚫 User has NO assigned permissions - denying internal access");
        } else {
            console.log(`✅ User has ${userPermissions.length} specific permissions`);
        }
    }
    
    // === Get RAG context with permissions filtering ===
    const { contextString: ragContext, documentIds: ragDocIds, sourceMap: ragSourceMap, categoryMap: ragCategoryMap } = 
        await ragSystem.getContext(question, topK, userPermissions);
    
    let finalContext = ragContext;
    let finalSourceMap = ragSourceMap;
    let finalCategoryMap = ragCategoryMap || {};
    
    // === Add Wikipedia context for company questions ===
    if (isCompanyQuestion) {
        console.log("📰 Company question detected, fetching Wikipedia data...");
        const companyInfo = await fetchCompanyInfo();
        const wikipediaContext = `
### Context from: Wikipedia - CDO Foodsphere
Company Name: ${companyInfo.name}
---
**Key Information (from Infobox):**
* **Founder:** Corazon Dayro Ong, Jose Ong
* **Founded:** June 25, 1975; 50 years ago
* **President:** Jerome Ong
* **Industry:** Food processing
* **Products:** Hotdogs, sausages, canned tuna, canned meat, ham, bacon, delicacies, sweet preserves and processed cheeses
* **Divisions:** Odyssey Foundation, Inc.
* **Official Website:** https://www.cdo.com.ph/
---
**Full Content (from Article Text):**
${companyInfo.description}
Source: ${companyInfo.url}
Last Updated: ${companyInfo.timestamp}
`;
        
        if (isGuest || userPermissions === null || (Array.isArray(userPermissions) && userPermissions.length === 0)) {
            console.log("✅ Guest/No-permission user - providing ONLY Wikipedia context");
            finalContext = wikipediaContext;
            finalSourceMap = { "Wikipedia - CDO Foodsphere": 0 };
            finalCategoryMap = { "Wikipedia - CDO Foodsphere": "General Information" };
        } else {
            finalContext = wikipediaContext + "\n" + ragContext;
            finalSourceMap["Wikipedia - CDO Foodsphere"] = 0;
            finalCategoryMap["Wikipedia - CDO Foodsphere"] = "General Information";
        }
    } else {
        // For non-company questions, check if user should have access
        if ((isGuest || userPermissions === null || (Array.isArray(userPermissions) && userPermissions.length === 0)) && 
            (ragContext.includes("don't have permission") || ragContext.includes("No relevant information") || ragContext.includes("No accessible information"))) {
            console.log("🚫 Guest/No-permission user asking about internal topics - access denied");
            finalContext = "I'm sorry, but as a guest user or without proper permissions, you can only ask general questions about CDO Foodsphere company information. For detailed internal policies and procedures, please log in with your employee account and ensure you have the necessary permissions.";
        }
    }
    
    return { 
        finalContext, 
        documentIds: ragDocIds,
        sourceMap: finalSourceMap,
        categoryMap: finalCategoryMap
    };
}