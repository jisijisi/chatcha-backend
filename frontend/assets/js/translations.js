// frontend/assets/js/translations.js
export const TRANSLATIONS = {
  en: {
    sidebar: {
      newChat: "New Chat",
      previousChats: "Previous Chats",
      guest: "Guest",
      guestUser: "Guest User",
      employee: "Employee",
      settings: "Settings",
      contact: "Contact us",
      logout: "Log out"
    },
    welcome: {
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening",
      subtitle: "I'm Cindy, your company AI assistant. How can I help you today?"
    },
    input: {
      placeholder: "Ask Cindy here",
      micLabel: "Use voice input",
      sendLabel: "Send message"
    },
    dateGroups: {
      today: "Today",
      yesterday: "Yesterday",
      previous7Days: "Previous 7 Days",
      previous30Days: "Previous 30 Days",
      older: "Older"
    },
    modals: {
      renameTitle: "Rename Chat",
      renameMessage: "Enter a new name for this chat:",
      renameConfirm: "Rename",
      deleteTitle: "Delete Chat",
      deleteMessage: "Are you sure you want to delete this chat?",
      deleteConfirm: "Delete",
      deleteAccountTitle: "Delete Account",
      deleteAccountMessage: "This will permanently delete your account, chats, and associated data.\n\nType your email or DELETE to confirm:",
      deleteAccountConfirm: "Delete Account",
      logoutTitle: "Logout",
      logoutMessageGuest: "Are you sure you want to logout? All your chat history will be deleted permanently.",
      logoutMessageEmp: "Are you sure you want to logout? Your chat history will be preserved.",
      logoutConfirm: "Logout",
      cancel: "Cancel",
      contactTitle: "Contact Us",
      contactMessage: "How would you like to contact us?\n\nEmail: support@cdofoodsphere.com\nPhone: +1 234 567 8900",
      ok: "OK",
      disconnectTitle: "Disconnect Google Services",
      disconnectMessage: "Are you sure? This will disconnect Google Calendar and Gmail access.",
      disconnectConfirm: "Disconnect",
      processing: "Processing...",
      addSubcatTitle: "Add Subcategory",
      addSubcatMessage: "Enter the name for the new subcategory:",
      deleteItemTitle: "Delete Item",
      deleteItemMessage: "Are you sure you want to delete this item? This action cannot be undone."
    },
    settings: {
      header: "Settings",
      nav: {
        general: "General",
        profile: "Profile",
        integration: "Integration",
        knowledge: "Knowledge Base",
        about: "About"
      },
      general: {
        appearance: "Appearance",
        theme: "Theme",
        themeSystem: "System",
        themeLight: "Light",
        themeDark: "Dark",
        language: "Language",
        interfaceLang: "Interface Language"
      },
      profile: {
        infoTitle: "Profile Information",
        displayName: "Display Name",
        email: "Email Address",
        phone: "Phone Number",
        actionsTitle: "Account Actions",
        logoutAll: "Log out of all devices",
        deleteAccount: "Delete account",
        buttons: {
          discard: "Discard",
          save: "Save Changes",
          logout: "Log out",
          delete: "Delete"
        }
      },
      integration: {
        title: "Connected Services",
        googleTitle: "Google Services",
        googleDesc: "Connect your account to enable AI access to your workspace.",
        btnConnect: "Connect",
        btnConnected: "Connected",
        btnDisconnect: "Disconnect"
      },
      knowledge: {
        title: "Knowledge Directory",
        searchPlaceholder: "Search documents...",
        actions: {
          refresh: "Refresh List",
          addDoc: "Add Document",
          addSubcat: "Add Subcategory",
          regenCache: "Regenerate Cache"
        },
        addDoc: {
          title: "Add New Document",
          aiLabel: "AI Auto-Convert",
          uploadBtn: "Convert to JSON",
          converting: "Converting...",
          docTitle: "Document Title",
          category: "Category",
          subcategory: "Subcategory",
          selectCat: "Select category...",
          selectSub: "Select subcategory...",
          selectCatFirst: "Select category first",
          content: "Content (JSON)",
          save: "Save Document",
          saving: "Saving...",
          cancel: "Cancel"
        },
        lastUpdated: "Last Updated",
        noDocs: "No documents found.",
        loading: "Loading knowledge base...",
        preview: "Preview"
      },
      about: {
        title: "About ChatCDO",
        desc: "ChatCDO is your intelligent AI assistant designed to help you with HR inquiries, company information, and data analysis.",
        version: "Version",
        featuresTitle: "Features",
        featuresList: "• Natural language understanding<br>• Real-time data analysis<br>• Integration with company systems<br>• Secure and private conversations",
        supportTitle: "Support",
        supportDesc: "For technical support or questions, please contact:<br>Email: support@cdofoodsphere.com",
        legalTitle: "Legal",
        privacy: "Privacy Policy",
        terms: "Terms of Service"
      }
    },
    toasts: {
      chatLoaded: "Loaded chat:",
      chatRenamed: "Chat renamed successfully",
      chatDeleted: "Chat deleted successfully",
      profileSaved: "Profile saved",
      profileUpdated: "Profile updated successfully!",
      changesDiscarded: "Changes discarded",
      themeSet: "Theme set to",
      langSet: "Language set to",
      welcomeMsg: "Welcome,",
      readyMsg: "Ready to assist with your CDO questions!",
      startedNewChat: "Started new chat",
      generationStopped: "Generation stopped",
      voiceCaptured: "Voice captured! Sending...",
      voiceError: "Voice error:",
      pleaseWait: "Please wait for the current response",
      listening: "Listening...",
      validChatName: "Please enter a valid chat name",
      loggedOutGuest: "Logged out. Guest data cleared.",
      loggedOut: "Logged out successfully",
      accountDeletion: "Account deletion is not yet implemented",
      nameUpdated: "Name updated successfully",
      failedUpdate: "Failed to update name",
      errorConnecting: "Error connecting to server",
      maintenanceMode: "🚧 Maintenance Mode: Cannot rename now",
      cannotRename: "Chat name cannot be empty",
      nameCannotEmpty: "Display name cannot be empty",
      profileUpdateFailed: "Failed to save profile to server.",
      profileLocalOnly: "Profile updated (Local only)",
      disconnectedSuccess: "Disconnected successfully.",
      disconnectFailed: "Failed to disconnect",
      kbRefreshed: "Knowledge base refreshed",
      docSaved: "Document saved successfully",
      docDeleted: "Document deleted",
      subcatCreated: "Subcategory created",
      subcatDeleted: "Subcategory deleted",
      cacheRegenStarted: "Cache regeneration started",
      cacheRegenSuccess: "Cache regenerated successfully",
      fileConverted: "File converted successfully",
      missingFields: "Please fill in all required fields",
      selectFile: "Please select a file first",
      selectParentCat: "Please select a parent category"
    },
    thinking: {
      placeholders: [
        "Thinking...",
        "Analyzing...",
        "Gathering context...",
        "Searching knowledge...",
        "Formulating answer...",
        "Double-checking facts...",
        "Synthesizing sources...",
        "Crunching data...",
        "Writing response..."
      ]
    },
    thinkingCtx: {
      chart: "Analyzing trends",
      compare: "Comparing options",
      table: "Organizing data",
      policy: "Checking HR policies",
      schedule: "Looking up schedules",
      email: "Drafting a helpful reply",
      calc: "Crunching the numbers",
      info: "Gathering the right details",
      debug: "Tracing the steps",
      general: "Thinking it through"
    },
    suggested: {
      companyInfo: [
        "Tell me about the history of CDO.",
        "What are CDO's main products?",
        "What is the company's mission or vision?",
      ],
      hrPolicies: [
        "What is the company policy on remote work?",
        "How do I file for a vacation leave?",
        "What are the company holidays?",
      ],
      dataAnalysis: [
        "Show me a chart of department project distribution",
        "Compare employee counts by department",
        "What's the trend of project completion rates?"
      ]
    }
  },
  tl: {
    sidebar: {
      newChat: "Bagong Usapan",
      previousChats: "Nakaraang Usapan",
      guest: "Bisita",
      guestUser: "Gumagamit (Bisita)",
      employee: "Empleyado",
      settings: "Mga Setting",
      contact: "Makipag-ugnayan",
      logout: "Mag-logout"
    },
    welcome: {
      morning: "Magandang umaga",
      afternoon: "Magandang hapon",
      evening: "Magandang gabi",
      subtitle: "Ako si Cindy, ang iyong AI assistant. Paano ako makakatulong ngayon?"
    },
    input: {
      placeholder: "Magtanong kay Cindy dito",
      micLabel: "Gamitin ang boses",
      sendLabel: "Ipadala"
    },
    dateGroups: {
      today: "Ngayon",
      yesterday: "Kahapon",
      previous7Days: "Nakaraang 7 Araw",
      previous30Days: "Nakaraang 30 Araw",
      older: "Luma"
    },
    modals: {
      renameTitle: "Palitan ang Pangalan",
      renameMessage: "Ilagay ang bagong pangalan para sa chat na ito:",
      renameConfirm: "Palitan",
      deleteTitle: "Burahin ang Chat",
      deleteMessage: "Sigurado ka bang gusto mong burahin ang chat na ito?",
      deleteConfirm: "Burahin",
      deleteAccountTitle: "Burahin ang Account",
      deleteAccountMessage: "Permanenteng mabubura ang iyong account, mga chat, at nauugnay na datos.\n\nI-type ang iyong email o DELETE para magpatunay:",
      deleteAccountConfirm: "Burahin ang Account",
      logoutTitle: "Mag-logout",
      logoutMessageGuest: "Sigurado ka bang gusto mong mag-logout? Ang lahat ng iyong chat history ay mabubura.",
      logoutMessageEmp: "Sigurado ka bang gusto mong mag-logout? Ang iyong chat history ay mananatili.",
      logoutConfirm: "Mag-logout",
      cancel: "Kanselahin",
      contactTitle: "Makipag-ugnayan",
      contactMessage: "Paano mo gustong makipag-ugnayan sa amin?\n\nEmail: support@cdofoodsphere.com\nTelepono: +1 234 567 8900",
      ok: "Sige",
      disconnectTitle: "Idiskonekta ang Serbisyo ng Google",
      disconnectMessage: "Sigurado ka ba? Mawawala ang access sa Google Calendar at Gmail.",
      disconnectConfirm: "Idiskonekta",
      processing: "Pinoproseso...",
      addSubcatTitle: "Magdagdag ng Subcategory",
      addSubcatMessage: "Ilagay ang pangalan para sa bagong subcategory:",
      deleteItemTitle: "Burahin ang Item",
      deleteItemMessage: "Sigurado ka bang gusto mong burahin ito? Hindi ito maibabalik."
    },
    settings: {
      header: "Mga Setting",
      nav: {
        general: "Pangkalahatan",
        profile: "Profile",
        integration: "Integrasyon",
        knowledge: "Knowledge Base",
        about: "Tungkol"
      },
      general: {
        appearance: "Hitsura",
        theme: "Tema",
        themeSystem: "System",
        themeLight: "Maliwanag",
        themeDark: "Madilim",
        language: "Wika",
        interfaceLang: "Wika ng Interface"
      },
      profile: {
        infoTitle: "Impormasyon ng Profile",
        displayName: "Pangalan",
        email: "Email Address",
        phone: "Numero ng Telepono",
        actionsTitle: "Aksyon sa Account",
        logoutAll: "Mag-logout sa lahat ng device",
        deleteAccount: "Burahin ang account",
        buttons: {
          discard: "I-discard",
          save: "I-save",
          logout: "Mag-logout",
          delete: "Burahin"
        }
      },
      integration: {
        title: "Konektadong Serbisyo",
        googleTitle: "Serbisyo ng Google",
        googleDesc: "Ikonekta ang iyong account para bigyan ng access ang AI sa iyong workspace.",
        btnConnect: "Ikonekta",
        btnConnected: "Konektado",
        btnDisconnect: "Idiskonekta"
      },
      knowledge: {
        title: "Direktoryo ng Kaalaman",
        searchPlaceholder: "Maghanap ng dokumento...",
        actions: {
          refresh: "I-refresh",
          addDoc: "Magdagdag ng Dokumento",
          addSubcat: "Magdagdag ng Subcategory",
          regenCache: "I-regenerate ang Cache"
        },
        addDoc: {
          title: "Magdagdag ng Bagong Dokumento",
          aiLabel: "AI Auto-Convert",
          uploadBtn: "I-convert sa JSON",
          converting: "Kino-convert...",
          docTitle: "Pamagat ng Dokumento",
          category: "Kategorya",
          subcategory: "Sub-kategorya",
          selectCat: "Pumili ng kategorya...",
          selectSub: "Pumili ng sub-kategorya...",
          selectCatFirst: "Pumili muna ng kategorya",
          content: "Nilalaman (JSON)",
          save: "I-save ang Dokumento",
          saving: "Nag-sa-save...",
          cancel: "Kanselahin"
        },
        lastUpdated: "Huling Na-update",
        noDocs: "Walang nahanap na dokumento.",
        loading: "Kinukuha ang knowledge base...",
        preview: "Tingnan"
      },
      about: {
        title: "Tungkol sa ChatCDO",
        desc: "Ang ChatCDO ay ang iyong matalinong AI assistant na dinisenyo para tumulong sa mga tanong sa HR, impormasyon ng kumpanya, at pagsusuri ng datos.",
        version: "Bersyon",
        featuresTitle: "Mga Tampok",
        featuresList: "• Pag-unawa sa natural na wika<br>• Real-time na pagsusuri ng datos<br>• Integrasyon sa sistema ng kumpanya<br>• Ligtas at pribadong usapan",
        supportTitle: "Suporta",
        supportDesc: "Para sa teknikal na suporta o mga katanungan, mangyaring makipag-ugnayan sa:<br>Email: support@cdofoodsphere.com",
        legalTitle: "Legal",
        privacy: "Patakaran sa Privacy",
        terms: "Mga Tuntunin ng Serbisyo"
      }
    },
    toasts: {
      chatLoaded: "Na-load ang chat:",
      chatRenamed: "Matagumpay na napalitan ang pangalan",
      chatDeleted: "Matagumpay na nabura ang chat",
      profileSaved: "Na-save ang profile",
      profileUpdated: "Matagumpay na na-update ang profile!",
      changesDiscarded: "Binalewala ang mga pagbabago",
      themeSet: "Itinakda ang tema sa",
      langSet: "Itinakda ang wika sa",
      welcomeMsg: "Maligayang pagdating,",
      readyMsg: "Handa na akong tumulong sa iyong mga tanong tungkol sa CDO!",
      startedNewChat: "Nagsimula ng bagong usapan",
      generationStopped: "Huminto ang pagsagot",
      voiceCaptured: "Nakuha ang boses! Ipinapadala...",
      voiceError: "May error sa boses:",
      pleaseWait: "Maghintay para sa kasalukuyang sagot",
      listening: "Nakikinig...",
      validChatName: "Mangyaring maglagay ng wastong pangalan",
      loggedOutGuest: "Nag-logout. Nabura ang guest data.",
      loggedOut: "Matagumpay na nag-logout",
      accountDeletion: "Hindi pa available ang pag-delete ng account",
      nameUpdated: "Matagumpay na na-update ang pangalan",
      failedUpdate: "Hindi na-update ang pangalan",
      errorConnecting: "May error sa koneksyon sa server",
      maintenanceMode: "🚧 Maintenance Mode: Hindi maaaring mag-rename ngayon",
      cannotRename: "Hindi maaaring walang laman ang pangalan",
      nameCannotEmpty: "Hindi maaaring walang laman ang pangalan",
      profileUpdateFailed: "Hindi na-save ang profile sa server.",
      profileLocalOnly: "Na-update ang profile (Local lang)",
      disconnectedSuccess: "Matagumpay na nag-disconnect.",
      disconnectFailed: "Hindi nag-disconnect",
      kbRefreshed: "Na-refresh ang knowledge base",
      docSaved: "Matagumpay na na-save ang dokumento",
      docDeleted: "Nabura ang dokumento",
      subcatCreated: "Nalikha ang subcategory",
      subcatDeleted: "Nabura ang subcategory",
      cacheRegenStarted: "Nagsimula na ang cache regeneration",
      cacheRegenSuccess: "Matagumpay na na-regenerate ang cache",
      fileConverted: "Matagumpay na na-convert ang file",
      missingFields: "Punan ang lahat ng kinakailangang field",
      selectFile: "Pumili muna ng file",
      selectParentCat: "Pumili ng parent category"
    },
    thinking: {
      placeholders: [
        "Nag-iisip...",
        "Sinusuri...",
        "Tinitipon ang konteksto...",
        "Hinahanap ang kaalaman...",
        "Binubuo ang sagot...",
        "Sini-siyasat ang datos...",
        "Pinagsasama ang mga sanggunian...",
        "Nagko-kompyut ng datos...",
        "Isinusulat ang sagot..."
      ]
    },
    thinkingCtx: {
      chart: "Sinusuri ang mga trend",
      compare: "Pinaghahambing ang mga opsyon",
      table: "Inaayos ang datos",
      policy: "Tinitingnan ang mga patakaran ng HR",
      schedule: "Tinitingnan ang mga iskedyul",
      email: "Gumagawa ng kapaki-pakinabang na sagot",
      calc: "Kinakalkula ang mga numero",
      info: "Kinukuha ang tamang detalye",
      debug: "Sinusundan ang mga hakbang",
      general: "Pinag-iisipan"
    },
    suggested: {
      companyInfo: [
        "Ikwento mo ang kasaysayan ng CDO.",
        "Ano ang mga pangunahing produkto ng CDO?",
        "Ano ang misyon at bisyon ng kumpanya?",
      ],
      hrPolicies: [
        "Ano ang patakaran sa remote work?",
        "Paano mag-file ng vacation leave?",
        "Ano ang mga holiday ng kumpanya?",
      ],
      dataAnalysis: [
        "Ipakita ang chart ng mga proyekto kada departamento",
        "Paghambingin ang bilang ng empleyado",
        "Ano ang trend ng pagtatapos ng mga proyekto?"
      ]
    }
  }
};
