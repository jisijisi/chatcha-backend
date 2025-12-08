// list-gemini-models.js - Check which models your API key can access
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

async function listAvailableModels() {
    console.log("=".repeat(60));
    console.log("CHECKING AVAILABLE GEMINI MODELS");
    console.log("=".repeat(60));
    
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        console.error("❌ GEMINI_API_KEY not found in .env file");
        return;
    }
    
    console.log("✅ API Key found");
    console.log("📋 Key preview:", apiKey.substring(0, 10) + "..." + apiKey.substring(apiKey.length - 4));
    
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        
        console.log("\n🔍 Fetching list of models...\n");
        
        // Try to list models using the REST API directly
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.models || data.models.length === 0) {
            console.log("⚠️  No models found for this API key");
            console.log("\n📝 This might mean:");
            console.log("  1. API key is for a different service");
            console.log("  2. Generative Language API is not enabled");
            console.log("  3. Account doesn't have access to Gemini models");
            return;
        }
        
        console.log(`✅ Found ${data.models.length} available models:\n`);
        
        // Group models by capability
        const textModels = [];
        const visionModels = [];
        const otherModels = [];
        
        data.models.forEach(model => {
            const info = {
                name: model.name.replace('models/', ''),
                displayName: model.displayName || model.name,
                methods: model.supportedGenerationMethods || [],
                version: model.version || 'N/A'
            };
            
            if (model.name.includes('vision') || model.name.includes('pro-vision')) {
                visionModels.push(info);
            } else if (model.name.includes('gemini')) {
                textModels.push(info);
            } else {
                otherModels.push(info);
            }
        });
        
        // Display Gemini text models
        if (textModels.length > 0) {
            console.log("📝 GEMINI TEXT MODELS:");
            console.log("-".repeat(60));
            textModels.forEach(model => {
                console.log(`\n  Model: ${model.name}`);
                console.log(`  Display Name: ${model.displayName}`);
                console.log(`  Supported Methods: ${model.methods.join(', ')}`);
            });
        }
        
        // Display Vision models
        if (visionModels.length > 0) {
            console.log("\n\n👁️  GEMINI VISION MODELS:");
            console.log("-".repeat(60));
            visionModels.forEach(model => {
                console.log(`\n  Model: ${model.name}`);
                console.log(`  Display Name: ${model.displayName}`);
                console.log(`  Supported Methods: ${model.methods.join(', ')}`);
            });
        }
        
        // Display other models
        if (otherModels.length > 0) {
            console.log("\n\n🔧 OTHER MODELS:");
            console.log("-".repeat(60));
            otherModels.forEach(model => {
                console.log(`\n  Model: ${model.name}`);
                console.log(`  Display Name: ${model.displayName}`);
                console.log(`  Supported Methods: ${model.methods.join(', ')}`);
            });
        }
        
        // Provide recommendations
        console.log("\n" + "=".repeat(60));
        console.log("💡 RECOMMENDATIONS");
        console.log("=".repeat(60));
        
        const recommendedModel = textModels.find(m => 
            m.name.includes('gemini-pro') || m.name.includes('gemini-1.5-pro')
        ) || textModels[0];
        
        if (recommendedModel) {
            console.log("\n✨ Recommended model for your use case:");
            console.log(`   ${recommendedModel.name}`);
            console.log("\n📝 Update your code to use:");
            console.log(`   const model = genAI.getGenerativeModel({ model: "${recommendedModel.name}" });`);
        } else {
            console.log("\n⚠️  No Gemini models found!");
            console.log("\n📝 Action required:");
            console.log("  1. Verify you're using a Gemini API key (not PaLM API)");
            console.log("  2. Check that 'Generative Language API' is enabled");
            console.log("  3. Create a new API key from: https://makersuite.google.com/app/apikey");
        }
        
    } catch (error) {
        console.error("\n" + "=".repeat(60));
        console.error("❌ ERROR CHECKING MODELS");
        console.error("=".repeat(60));
        console.error("\n🔴 Error:", error.message);
        
        if (error.message.includes('403')) {
            console.log("\n📝 API key doesn't have permission to list models");
            console.log("\nTry these models directly:");
            console.log("  • gemini-pro");
            console.log("  • gemini-1.5-pro-latest");
            console.log("  • gemini-1.0-pro");
        } else if (error.message.includes('API key not valid')) {
            console.log("\n❌ Your API key is invalid");
            console.log("\n📝 To fix:");
            console.log("1. Go to: https://makersuite.google.com/app/apikey");
            console.log("2. Create a new API key");
            console.log("3. Update your .env file");
        } else {
            console.log("\n📝 Try these common model names:");
            console.log("  • gemini-pro");
            console.log("  • gemini-1.5-pro-latest");
            console.log("  • gemini-1.0-pro");
            console.log("  • gemini-pro-vision");
        }
        
        console.log("\n📞 Full error:");
        console.error(error);
    }
}

// Run the check
console.log("\n🚀 Checking available Gemini models...\n");
listAvailableModels().catch(console.error);