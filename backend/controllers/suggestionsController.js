// backend/controllers/suggestionsController.js
import { pool } from '../config/database.js';
import fetch from 'node-fetch';

/**
 * Generate a suggested question based on user's enabled knowledge
 * Called on first login or when admin updates access control
 */
export const generateSuggestedQuestion = async (req, res) => {
    try {
        const userEmail = req.header('X-User-Email');
        
        if (!userEmail) {
            return res.status(401).json({ success: false, message: "User email header missing" });
        }

        // Get employee
        const [employees] = await pool.execute(
            'SELECT id, name FROM employees WHERE email = ? AND is_active = TRUE',
            [userEmail]
        );

        if (employees.length === 0) {
            return res.status(404).json({ success: false, message: "Employee not found" });
        }

        const employee = employees[0];
        const employeeId = employee.id;

        // Get user's enabled knowledge/access permissions
        const [permissions] = await pool.execute(`
            SELECT 
                category_id, 
                subcategory_id, 
                source_id,
                (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL) as has_full_access
            FROM employee_access_permissions 
            WHERE employee_id = ?
        `, [employeeId]);

        // Build knowledge context from permissions
        let knowledgeContext = '';
        
        if (permissions.length === 0) {
            knowledgeContext = 'No specific knowledge access has been assigned.';
        } else {
            const hasFullAccess = permissions.some(p => p.has_full_access);
            
            if (hasFullAccess) {
                knowledgeContext = 'Full access to all company knowledge bases including HR policies, company information, and data analysis capabilities.';
            } else {
                // Fetch category and subcategory names
                const categoryIds = [...new Set(permissions.filter(p => p.category_id).map(p => p.category_id))];
                const subcategoryIds = [...new Set(permissions.filter(p => p.subcategory_id).map(p => p.subcategory_id))];
                
                let categoryNames = [];
                let subcategoryNames = [];
                
                if (categoryIds.length > 0) {
                    const [cats] = await pool.execute(
                        `SELECT DISTINCT name FROM knowledge_categories WHERE id IN (${categoryIds.join(',')})`,
                        []
                    );
                    categoryNames = cats.map(c => c.name);
                }
                
                if (subcategoryIds.length > 0) {
                    const [subcats] = await pool.execute(
                        `SELECT DISTINCT name FROM knowledge_subcategories WHERE id IN (${subcategoryIds.join(',')})`,
                        []
                    );
                    subcategoryNames = subcats.map(sc => sc.name);
                }
                
                const knowledgeList = [...categoryNames, ...subcategoryNames];
                knowledgeContext = knowledgeList.length > 0 
                    ? `Access to: ${knowledgeList.join(', ')}.`
                    : 'No specific knowledge access assigned.';
            }
        }

        // Generate suggested question using LLM
        const suggestedQuestion = await generateSuggestionWithLLM(
            employee.name,
            knowledgeContext
        );

        // Store in database
        await pool.execute(
            `UPDATE employees SET suggested_question = ?, suggested_question_generated_at = NOW() WHERE id = ?`,
            [suggestedQuestion, employeeId]
        );

        res.json({
            success: true,
            suggested_question: suggestedQuestion,
            knowledge_context: knowledgeContext
        });

    } catch (error) {
        console.error('❌ Error generating suggested question:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate suggested question',
            error: error.message
        });
    }
};

/**
 * Get the stored suggested question for a user
 * Checks on every login: if empty, generates and stores it; if not empty, returns cached version
 */
export const getSuggestedQuestion = async (req, res) => {
    console.log('\n🔴 ========== getSuggestedQuestion CALLED ==========');
    try {
        const userEmail = req.header('X-User-Email');
        console.log(`📧 X-User-Email header: ${userEmail}`);
        
        if (!userEmail) {
            console.warn('⚠️ getSuggestedQuestion: User email header missing');
            return res.status(401).json({ success: false, message: "User email header missing" });
        }

        console.log(`📌 getSuggestedQuestion: Fetching for user ${userEmail}`);

        const [employees] = await pool.execute(
            'SELECT id, name, suggested_question FROM employees WHERE email = ? AND is_active = TRUE',
            [userEmail]
        );

        if (employees.length === 0) {
            console.warn(`⚠️ getSuggestedQuestion: Employee not found for ${userEmail}`);
            return res.status(404).json({ success: false, message: "Employee not found" });
        }

        const employee = employees[0];
        console.log(`✓ Found employee: ID=${employee.id}, Name=${employee.name}, HasSuggestion=${!!employee.suggested_question}`);

        // If suggested questions already exist, return them immediately
        if (employee.suggested_question) {
            try {
                const suggestedQuestions = JSON.parse(employee.suggested_question);
                console.log(`✓ Returning cached ${Array.isArray(suggestedQuestions) ? suggestedQuestions.length : 1} suggestion(s) for ${userEmail}`);
                return res.json({
                    success: true,
                    suggested_questions: Array.isArray(suggestedQuestions) ? suggestedQuestions : [suggestedQuestions],
                    is_cached: true
                });
            } catch (parseError) {
                // If it's not valid JSON, treat it as a single question string
                console.log(`✓ Returning cached suggestion (legacy format) for ${userEmail}`);
                return res.json({
                    success: true,
                    suggested_questions: [employee.suggested_question],
                    is_cached: true
                });
            }
        }

        // Otherwise, generate it (this happens every login until questions are generated)
        // Get employee ID and generate
        const employeeId = employee.id;
        const employeeName = employee.name;
        console.log(`🔄 Generating new suggested question for ${userEmail} (${employeeName})`);

        // Get user's enabled knowledge/access permissions
        const [permissions] = await pool.execute(`
            SELECT 
                category_id, 
                subcategory_id, 
                source_id,
                (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL) as has_full_access
            FROM employee_access_permissions 
            WHERE employee_id = ?
        `, [employeeId]);
        console.log(`✓ Found ${permissions.length} permission records for employee ${employeeId}`);

        // Build knowledge context from permissions
        let knowledgeContext = '';
        let suggestedQuestions = [];
        
        // 12 hardcoded general questions for all users
        const GENERAL_QUESTIONS = [
            "What are our company policies?",
            "Show me employee data by department",
            "What is our vacation leave policy?",
            "How do I request time off?",
            "What benefits are available?",
            "Tell me about the company history",
            "What are our core values?",
            "Show me organizational structure",
            "What professional development opportunities are available?",
            "How do I access HR documents?",
            "What is the company mission statement?",
            "Show me recent company announcements"
        ];
        
        if (permissions.length === 0) {
            knowledgeContext = 'No specific knowledge access has been assigned.';
            suggestedQuestions = GENERAL_QUESTIONS;
        } else {
            const hasFullAccess = permissions.some(p => p.has_full_access);
            
            if (hasFullAccess) {
                knowledgeContext = 'Full access to all company knowledge bases including HR policies, company information, and data analysis capabilities.';
                suggestedQuestions = GENERAL_QUESTIONS;
            } else {
                // Fetch category and subcategory names
                const categoryIds = [...new Set(permissions.filter(p => p.category_id).map(p => p.category_id))];
                const subcategoryIds = [...new Set(permissions.filter(p => p.subcategory_id).map(p => p.subcategory_id))];
                
                let categoryNames = [];
                let subcategoryNames = [];
                let subcategoryDetails = [];
                
                if (categoryIds.length > 0) {
                    const [cats] = await pool.execute(
                        `SELECT DISTINCT id, name FROM knowledge_categories WHERE id IN (${categoryIds.join(',')})`,
                        []
                    );
                    categoryNames = cats.map(c => c.name);
                }
                
                if (subcategoryIds.length > 0) {
                    const [subcats] = await pool.execute(
                        `SELECT DISTINCT id, name FROM knowledge_subcategories WHERE id IN (${subcategoryIds.join(',')})`,
                        []
                    );
                    subcategoryNames = subcats.map(sc => sc.name);
                    subcategoryDetails = subcats;
                }
                
                const knowledgeList = [...categoryNames, ...subcategoryNames];
                knowledgeContext = knowledgeList.length > 0 
                    ? `Access to: ${knowledgeList.join(', ')}.`
                    : 'No specific knowledge access assigned.';

                // Generate one question per subcategory
                console.log(`🔄 Generating suggestions for ${subcategoryDetails.length} subcategories...`);
                for (const subcat of subcategoryDetails) {
                    const contextForSubcat = `The user has access to: ${subcat.name}.`;
                    const suggestion = await generateSuggestionWithLLM(employeeName, contextForSubcat);
                    suggestedQuestions.push(suggestion);
                }

                // Add general questions
                suggestedQuestions = [...suggestedQuestions, ...GENERAL_QUESTIONS];
            }
        }

        // Remove duplicates and limit to reasonable number
        suggestedQuestions = [...new Set(suggestedQuestions)].slice(0, 20);

        console.log(`✓ Generated ${suggestedQuestions.length} total suggestions`);

        // Store as JSON array in database
        const suggestionsJson = JSON.stringify(suggestedQuestions);
        await pool.execute(
            `UPDATE employees SET suggested_question = ?, suggested_question_generated_at = NOW() WHERE id = ?`,
            [suggestionsJson, employeeId]
        );
        console.log(`✅ Successfully stored ${suggestedQuestions.length} suggestions for user ${userEmail} (ID: ${employeeId})`);

        res.json({
            success: true,
            suggested_questions: suggestedQuestions,
            is_cached: false
        });
        console.log(`🔴 ========== getSuggestedQuestion COMPLETED SUCCESSFULLY ==========\n`);

    } catch (error) {
        console.error('❌ Error in getSuggestedQuestion:', error);
        console.error('❌ Stack trace:', error.stack);
        console.log(`🔴 ========== getSuggestedQuestion FAILED ==========\n`);
        res.status(500).json({
            success: false,
            message: 'Failed to get suggested question',
            error: error.message
        });
    }
};

/**
 * Helper function to call LLM for suggestion generation
 */
async function generateSuggestionWithLLM(userName, knowledgeContext) {
    try {
        console.log(`🤖 Calling LLM for ${userName} with context: ${knowledgeContext.substring(0, 50)}...`);
        
        if (!process.env.GEMINI_API_KEY) {
            console.warn('⚠️ GEMINI_API_KEY not configured, using fallback');
            return generateFallbackSuggestion(knowledgeContext);
        }

        const prompt = `You are a helpful assistant for a company AI system called ChatCDO. Your task is to generate ONE compelling, specific suggested question for a user based on their knowledge access.

The user's name is: ${userName}
The user has access to: ${knowledgeContext}

Generate a single, specific, practical question that:
1. Is relevant to the knowledge they have access to
2. Is something they might realistically ask
3. Is specific and actionable (not too broad)
4. Takes advantage of the AI's capabilities (data analysis, policy lookup, etc.)
5. Is in simple, natural language

The question should be phrased as if the user is asking it. Return ONLY the question text, nothing else. No quotes, no explanation, just the question.

Example outputs:
- "Show me the total number of employees by department"
- "What is our vacation leave policy?"
- "What are CDO's main products?"`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        console.log(`📤 Calling Gemini API: ${apiUrl.substring(0, 60)}...`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 100
                }
            })
        });

        console.log(`📥 API Response: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error ${response.status}:`, errorText);
            return generateFallbackSuggestion(knowledgeContext);
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            let suggestion = data.candidates[0].content.parts[0].text.trim();
            
            // Remove quotes if present
            suggestion = suggestion.replace(/^["']|["']$/g, '');
            
            // Ensure it doesn't exceed reasonable length
            if (suggestion.length > 500) {
                suggestion = suggestion.substring(0, 500);
            }
            
            console.log(`✅ LLM generated: "${suggestion}"`);
            return suggestion;
        }

        console.warn('⚠️ Unexpected LLM response format, using fallback');
        return generateFallbackSuggestion(knowledgeContext);

    } catch (error) {
        console.error('❌ Error calling LLM:', error.message);
        return generateFallbackSuggestion(knowledgeContext);
    }
}

/**
 * Generate a fallback suggestion when LLM fails
 */
function generateFallbackSuggestion(knowledgeContext) {
    // Parse what knowledge they have access to and generate contextual fallback
    if (knowledgeContext.includes('HR') || knowledgeContext.includes('Employee')) {
        return "What is our vacation leave policy?";
    } else if (knowledgeContext.includes('Finance') || knowledgeContext.includes('Budget')) {
        return "Show me the financial reports";
    } else if (knowledgeContext.includes('Product') || knowledgeContext.includes('Sales')) {
        return "What are our main products?";
    } else if (knowledgeContext.includes('Company')) {
        return "Tell me about the company";
    }
    return "What information can you help me with today?";
}

/**
 * Clear suggested questions for users when their access control is updated
 * Called from adminController when permissions are changed
 */
export const clearSuggestedQuestion = async (employeeId) => {
    try {
        await pool.execute(
            `UPDATE employees SET suggested_question = NULL, suggested_question_generated_at = NULL WHERE id = ?`,
            [employeeId]
        );
        console.log(`✅ Cleared suggested question for employee ${employeeId}`);
        return true;
    } catch (error) {
        console.error('❌ Error clearing suggested question:', error);
        return false;
    }
};

/**
 * Clear multiple suggested questions
 */
export const clearSuggestedQuestionsForEmployees = async (employeeIds) => {
    try {
        if (employeeIds.length === 0) return true;
        
        const placeholders = employeeIds.map(() => '?').join(',');
        await pool.execute(
            `UPDATE employees SET suggested_question = NULL, suggested_question_generated_at = NULL WHERE id IN (${placeholders})`,
            employeeIds
        );
        console.log(`✅ Cleared suggested questions for ${employeeIds.length} employees`);
        return true;
    } catch (error) {
        console.error('❌ Error clearing suggested questions:', error);
        return false;
    }
};