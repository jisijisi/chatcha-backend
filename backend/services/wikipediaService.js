// services/wikipediaService.js
import fetch from 'node-fetch';

const WIKIPEDIA_CONFIG = {
  company: "CDO Foodsphere",
  wikipediaUrl: "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=true&titles=CDO_Foodsphere&origin=*",
  fallbackInfo: {
    name: "CDO Foodsphere, Inc.",
    description: "A Philippine food manufacturing company",
    industry: "Food processing"
  }
};

let wikipediaCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

export async function fetchCompanyInfo() {
  if (wikipediaCache && cacheTimestamp && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
    console.log("📦 Using cached Wikipedia data");
    return wikipediaCache;
  }
  try {
    console.log("🌐 Fetching full page content from Wikipedia...");
    const response = await fetch(WIKIPEDIA_CONFIG.wikipediaUrl, {
      headers: {
        'User-Agent': 'CompanyAIAssistant/1.0'
      }
    });
    if (!response.ok) {
      throw new Error(`Wikipedia API error: ${response.status}`);
    }
    const data = await response.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    const pageData = pages[pageId];
    const companyInfo = {
      name: pageData.title || WIKIPEDIA_CONFIG.company,
      description: pageData.extract || "A Philippine food manufacturing company", 
      url: `https://en.wikipedia.org/wiki/${pageData.title.replace(/ /g, '_')}`,
      timestamp: new Date().toISOString()
    };
    wikipediaCache = companyInfo;
    cacheTimestamp = Date.now();
    console.log("✅ Wikipedia data fetched and cached successfully");
    return companyInfo;
  } catch (error) {
    console.warn("⚠️ Could not fetch Wikipedia info:", error.message);
    return {
      ...WIKIPEDIA_CONFIG.fallbackInfo,
      timestamp: new Date().toISOString(),
      source: "fallback"
    };
  }
}