// services/aiService.js - FIXED: Proper Full Access Handling
import fetch from 'node-fetch';
import { fetchCompanyInfo } from './wikipediaService.js';
import { pool } from '../config/database.js';
import { getUserPermissions } from './ragService.js';

// Main function to get enhanced context with RAG and Wikipedia
export async function getEnhancedContext(question, ragSystem, topK = 20, userEmail = null) {
    const lowerQuestion = question.toLowerCase();
    const companyKeywords = ['cdo', 'foodsphere', 'history', 'founder', 'background', 'when was', 'who founded', 'president', 'mission', 'vision', 'core values'];
    const isCompanyQuestion = companyKeywords.some(keyword => lowerQuestion.includes(keyword));
    
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
    const { 
        contextString: ragContext, 
        documentIds: ragDocIds, 
        sourceMap: ragSourceMap, 
        categoryMap: ragCategoryMap,
        isMissingKnowledge,
        isAccessDenied
    } = await ragSystem.getContext(question, topK, userPermissions);
    
    let finalContext = ragContext;
    let finalSourceMap = ragSourceMap;
    let finalCategoryMap = ragCategoryMap || {};
    
    let accessDenied = false;

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
            accessDenied = true;
        }
    }
    
    return { 
        finalContext, 
        documentIds: ragDocIds,
        sourceMap: finalSourceMap,
        categoryMap: finalCategoryMap,
        accessDenied,
        isMissingKnowledge,
        isAccessDenied
    };
}