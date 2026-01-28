// Integrations Hub Module - REVISED
import { apiFetch } from '../core/api.js';
import { formatDateTime, escapeHtml } from '../core/utils.js';
import { showToast, setButtonLoading, openModal, closeModal, showConfirmationModal } from '../core/ui.js';

let allSources = [];
let currentEditId = null; // Track ID for editing
let sortField = null;
let sortDirection = 'asc';
let descPhaseTimer = null;
let descPhaseIndex = 0;
let descPhaseSteps = [];
let descProgressRunning = false;

// Initialize integrations
function setupIntegrationsView() {
  console.log('🔌 Setting up Integrations module...');

  // ==========================================
  // 1. GOOGLE SHEETS INTEGRATION SETUP
  // ==========================================
  const sheetBtn = document.getElementById('btn-connect-sheet');
  const sheetModalClose = document.getElementById('sheet-modal-close');
  const sheetModalCancel = document.getElementById('sheet-modal-cancel');
  const sheetSaveBtn = document.getElementById('sheet-modal-save');
  
  // Sheet Description Toolbar Buttons
  const btnAnalyzeSheet = document.getElementById('btn-analyze-sheet-manual');
  const btnExpandSheetDesc = document.getElementById('btn-expand-sheet-desc');

  if (sheetBtn) {
    const newSheetBtn = sheetBtn.cloneNode(true);
    sheetBtn.parentNode.replaceChild(newSheetBtn, sheetBtn);
    
    newSheetBtn.addEventListener('click', async () => {
      resetModalState('sheet');
      loadCategoriesIntoSelect('sheet-category-select');
      openModal('sheet-integration-modal');
    });
  }

  // Bind Auto Generate Button for Sheet
  if (btnAnalyzeSheet) {
      btnAnalyzeSheet.onclick = (e) => {
          e.preventDefault();
          const descTextarea = document.getElementById('sheet-description');
          startDescriptionProgress('sheet');
          handleAnalyzeClick(btnAnalyzeSheet, descTextarea, 'sheet-url');
      };
  }

  // Bind Expand/Fullscreen Button for Sheet
  if (btnExpandSheetDesc) {
      btnExpandSheetDesc.onclick = (e) => {
          e.preventDefault();
          toggleFullscreenDescription(btnExpandSheetDesc, 'sheet-description-group');
      };
  }

  const closeSheetModal = () => closeModal('sheet-integration-modal');
  if (sheetModalClose) sheetModalClose.onclick = closeSheetModal;
  if (sheetModalCancel) sheetModalCancel.onclick = closeSheetModal;
  
  if (sheetSaveBtn) {
    const newSheetSaveBtn = sheetSaveBtn.cloneNode(true);
    sheetSaveBtn.parentNode.replaceChild(newSheetSaveBtn, sheetSaveBtn);

    newSheetSaveBtn.addEventListener('click', async () => {
      const url = document.getElementById('sheet-url')?.value;
      const name = document.getElementById('sheet-name')?.value;
      const description = document.getElementById('sheet-description')?.value;
      const category_id = document.getElementById('sheet-category-select')?.value;

      if (!url || !description) {
        showToast('URL and AI Description are required', 'error');
        return;
      }

      setButtonLoading(newSheetSaveBtn, true);

      // Determine method and endpoint based on edit state
      const method = currentEditId ? 'PUT' : 'POST';
      const endpoint = currentEditId 
          ? `/admin/integrations/${currentEditId}` 
          : '/admin/integrations/google-sheet';

      try {
        const response = await apiFetch(endpoint, {
          method: method,
          body: JSON.stringify({ 
              url, name, description,
              source_type: 'google_sheet',
              category_id: category_id || null, 
              subcategory_id: null 
          })
        });
        
        showToast(response.message || 'Saved successfully', 'success');
        closeSheetModal();
        loadIntegrationData(); 
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        setButtonLoading(newSheetSaveBtn, false);
      }
    });
  }

  // ==========================================
  // 2. EXTERNAL API INTEGRATION SETUP
  // ==========================================
  const apiBtn = document.getElementById('btn-connect-api');
  const apiModalClose = document.getElementById('api-modal-close');
  const apiModalCancel = document.getElementById('api-modal-cancel');
  const apiModalSave = document.getElementById('api-modal-save');
  
  const addHeaderBtn = document.getElementById('btn-add-header');
  const addParamBtn = document.getElementById('btn-add-param');
  
  // API Description Toolbar Buttons
  const btnAnalyzeApi = document.getElementById('btn-analyze-api-manual');
  const btnExpandDesc = document.getElementById('btn-expand-desc');

  if (apiBtn) {
    const newApiBtn = apiBtn.cloneNode(true);
    apiBtn.parentNode.replaceChild(newApiBtn, apiBtn);

    newApiBtn.addEventListener('click', () => {
      resetModalState('api');
      
      const headerCont = document.getElementById('api-headers-container');
      if (headerCont) headerCont.innerHTML = '';

      const paramCont = document.getElementById('api-params-container');
      if (paramCont) paramCont.innerHTML = '';
      
      loadCategoriesIntoSelect('api-category-select');

      // Add default empty rows
      addHeaderRow();
      addParameterRow();
      
      openModal('api-integration-modal');
    });
  }

  // Bind Dynamic Row Buttons
  if (addHeaderBtn) {
      addHeaderBtn.onclick = (e) => { e.preventDefault(); addHeaderRow(); };
  }
  if (addParamBtn) {
      addParamBtn.onclick = (e) => { e.preventDefault(); addParameterRow(); };
  }

  // Bind Auto Generate Button for API
  if (btnAnalyzeApi) {
      btnAnalyzeApi.onclick = (e) => {
          e.preventDefault();
          const descTextarea = document.getElementById('api-description');
          startDescriptionProgress('api');
          handleAnalyzeClick(btnAnalyzeApi, descTextarea, 'api-url');
      };
  }

  // Bind Expand/Fullscreen Button for API
  if (btnExpandDesc) {
      btnExpandDesc.onclick = (e) => {
          e.preventDefault();
          toggleFullscreenDescription(btnExpandDesc, 'api-description-group');
      };
  }

  const closeApiModal = () => closeModal('api-integration-modal');
  if (apiModalClose) apiModalClose.onclick = closeApiModal;
  if (apiModalCancel) apiModalCancel.onclick = closeApiModal;

  if (apiModalSave) {
    const newApiSaveBtn = apiModalSave.cloneNode(true);
    apiModalSave.parentNode.replaceChild(newApiSaveBtn, apiModalSave);

    newApiSaveBtn.addEventListener('click', async () => {
      const name = document.getElementById('api-name')?.value;
      const method = document.getElementById('api-method')?.value;
      const url = document.getElementById('api-url')?.value;
      const description = document.getElementById('api-description')?.value;
      const category_id = document.getElementById('api-category-select')?.value;

      if (!name || !url || !description) {
        showToast('Name, Endpoint, and Description are required', 'warning');
        return;
      }

      // Collect Headers
      const headers = {};
      document.querySelectorAll('.header-row').forEach(row => {
          const keyInput = row.querySelector('.header-key');
          const valInput = row.querySelector('.header-val');
          if (keyInput && valInput && keyInput.value.trim()) {
              headers[keyInput.value.trim()] = valInput.value.trim();
          }
      });

      // Collect Parameters
      const parameters = [];
      document.querySelectorAll('.param-row').forEach(row => {
          const pName = row.querySelector('.param-name')?.value.trim();
          const pType = row.querySelector('.param-type')?.value;
          const pIn = row.querySelector('.param-in')?.value;
          const pDesc = row.querySelector('.param-desc')?.value.trim();
          
          if (pName) {
              parameters.push({
                  name: pName,
                  type: pType,
                  in: pIn,
                  description: pDesc,
                  required: true
              });
          }
      });

      setButtonLoading(newApiSaveBtn, true);

      // Determine method and endpoint based on edit state
      const requestMethod = currentEditId ? 'PUT' : 'POST';
      const endpoint = currentEditId 
          ? `/admin/integrations/${currentEditId}` 
          : '/admin/integrations/google-sheet'; 

      try {
        const response = await apiFetch(endpoint, {
          method: requestMethod,
          body: JSON.stringify({ 
              name, 
              description,
              source_type: 'external_api',
              url: url,
              category_id: category_id || null, 
              api_config: { method, headers, parameters }
          })
        });
        
        showToast(response.message || 'Saved successfully', 'success');
        closeApiModal();
        loadIntegrationData();
      } catch (error) {
        showToast(error.message || 'Failed to save API', 'error');
      } finally {
        setButtonLoading(newApiSaveBtn, false);
      }
    });
  }

  // ==========================================
  // 3. DATABASE & SAP INTEGRATION SETUP
  // ==========================================
  const dbBtn = document.getElementById('btn-connect-db');
  const dbModalClose = document.getElementById('db-modal-close');
  const dbModalCancel = document.getElementById('db-modal-cancel');
  const dbModalSave = document.getElementById('db-modal-save');
  const dbTestBtn = document.getElementById('btn-test-db-connection');
  const btnExpandDbDesc = document.getElementById('btn-expand-db-desc');
  const btnAnalyzeDb = document.getElementById('btn-analyze-db-manual');

  if (dbBtn) {
    const newDbBtn = dbBtn.cloneNode(true);
    dbBtn.parentNode.replaceChild(newDbBtn, dbBtn);

    newDbBtn.addEventListener('click', () => {
        resetModalState('database');
        loadCategoriesIntoSelect('db-category-select');
        openModal('db-integration-modal');
    });
  }

  const closeDbModal = () => closeModal('db-integration-modal');
  if (dbModalClose) dbModalClose.onclick = closeDbModal;
  if (dbModalCancel) dbModalCancel.onclick = closeDbModal;

  if (dbTestBtn) {
    dbTestBtn.onclick = async (e) => {
        e.preventDefault();
        const type = document.getElementById('db-type')?.value;
        const host = document.getElementById('db-host')?.value;
        const port = document.getElementById('db-port')?.value;
        const database = document.getElementById('db-database')?.value;
        const user = document.getElementById('db-user')?.value;
        const password = document.getElementById('db-password')?.value;
        
        if (!host || !user || !database) {
            showToast('Host, User, and Database are required', 'warning');
            return;
        }

        const originalText = dbTestBtn.innerHTML;
        dbTestBtn.innerHTML = 'Testing...';
        dbTestBtn.disabled = true;

        try {
            const response = await apiFetch('/admin/integrations/test-db', {
                method: 'POST',
                body: JSON.stringify({ type, host, port, database, user, password })
            });

            if (response.success) {
                showToast('Connection Successful!', 'success');
            } else {
                showToast('Connection Failed: ' + (response.error || 'Unknown'), 'error');
            }
        } catch (error) {
            showToast('Connection Failed: ' + error.message, 'error');
        } finally {
            dbTestBtn.innerHTML = originalText;
            dbTestBtn.disabled = false;
        }
    };
  }
  
  // Bind Expand/Fullscreen Button for DB
  if (btnExpandDbDesc) {
      btnExpandDbDesc.onclick = (e) => {
          e.preventDefault();
          toggleFullscreenDescription(btnExpandDbDesc, 'db-description-group');
      };
  }

  // Bind Auto Generate Button for DB
  if (btnAnalyzeDb) {
      btnAnalyzeDb.onclick = async (e) => {
          e.preventDefault();
          const descTextarea = document.getElementById('db-description');
          const type = document.getElementById('db-type')?.value;
          const host = document.getElementById('db-host')?.value;
          const port = document.getElementById('db-port')?.value;
          const database = document.getElementById('db-database')?.value;
          const user = document.getElementById('db-user')?.value;
          const password = document.getElementById('db-password')?.value;
          
          if (!host || !user || !database) {
              showToast('Host, User, and Database required for analysis', 'warning');
              return;
          }
          
          const originalText = btnAnalyzeDb.innerHTML;
          btnAnalyzeDb.innerHTML = 'Scanning...';
          btnAnalyzeDb.disabled = true;
          startDescriptionProgress('db');

          try {
              const response = await apiFetch('/admin/integrations/analyze-db', {
                  method: 'POST',
                  body: JSON.stringify({ type, host, port, database, user, password })
              });

              if (response.success) {
                  let desc = response.description;
                  descTextarea.value = desc;
                  showToast('Description generated!', 'success');
                  finishDescriptionProgress(true);
              } else {
                  descTextarea.value = "Analysis failed: " + response.error;
                  showToast('Analysis failed', 'error');
                  finishDescriptionProgress(false, response.error);
              }
          } catch (error) {
              descTextarea.value = "Analysis error: " + error.message;
              showToast('Analysis error', 'error');
              finishDescriptionProgress(false, error.message);
          } finally {
              btnAnalyzeDb.innerHTML = originalText;
              btnAnalyzeDb.disabled = false;
          }
      };
  }

  // Bind Test Query Button for DB
  // REMOVED PER USER REQUEST - Feature no longer needed
  /*
  const btnTestDbQuery = document.getElementById('btn-test-db-query');
  if (btnTestDbQuery) {
      btnTestDbQuery.onclick = async (e) => {
          e.preventDefault();
          const question = document.getElementById('db-sample-question')?.value;
          const resultDiv = document.getElementById('db-query-result');
          
          if (!question) {
              showToast('Please enter a question to test', 'warning');
              return;
          }
          
          if (!resultDiv) return;
          
          resultDiv.innerHTML = '<span style="color:#64748b;">Processing query...</span>';
          btnTestDbQuery.disabled = true;
          
          // MOCK: In a real implementation, this would call an endpoint that uses the LLM + Text-to-SQL
          // For now, we simulate a successful response to show the UI flow.
          setTimeout(() => {
              resultDiv.innerHTML = `
                  <div style="color:#0f172a; font-weight:600; margin-bottom:4px;">Generated SQL:</div>
                  <div style="background:#1e293b; color:#e2e8f0; padding:8px; border-radius:4px; font-size:0.75rem; margin-bottom:8px;">SELECT count(*) as active_count FROM users WHERE status = 'Active'</div>
                  <div style="color:#059669; font-weight:600;">Result: 42</div>
              `;
              btnTestDbQuery.disabled = false;
          }, 1500);
      };
  }
  */

  if (dbModalSave) {
      const newDbSaveBtn = dbModalSave.cloneNode(true);
      dbModalSave.parentNode.replaceChild(newDbSaveBtn, dbModalSave);

      newDbSaveBtn.addEventListener('click', async () => {
          const name = document.getElementById('db-name')?.value;
          const type = document.getElementById('db-type')?.value;
          const host = document.getElementById('db-host')?.value;
          const port = document.getElementById('db-port')?.value;
          const database = document.getElementById('db-database')?.value;
          const user = document.getElementById('db-user')?.value;
          const password = document.getElementById('db-password')?.value;
          const description = document.getElementById('db-description')?.value;
          const category_id = document.getElementById('db-category-select')?.value;

          if (!name || !host || !database || !user || !description) {
              showToast('Please fill all required fields', 'warning');
              return;
          }

          setButtonLoading(newDbSaveBtn, true);

          const requestMethod = currentEditId ? 'PUT' : 'POST';
          const endpoint = currentEditId 
              ? `/admin/integrations/${currentEditId}` 
              : '/admin/integrations/database'; 

          try {
              // Note: Ideally, don't send password if it's unchanged during edit.
              // For now, we assume standard payload.
              const body = {
                  name,
                  description,
                  source_type: 'database',
                  category_id: category_id || null,
                  db_config: {
                      type, host, port, database, user, password
                  }
              };

              // If editing and password is empty, maybe don't send it? 
              // Or backend handles it. We'll send what is there.

              const response = await apiFetch(endpoint, {
                  method: requestMethod,
                  body: JSON.stringify(body)
              });

              showToast(response.message || 'Database connected successfully', 'success');
              closeDbModal();
              loadIntegrationData();
          } catch (error) {
              showToast(error.message || 'Failed to save Database', 'error');
          } finally {
              setButtonLoading(newDbSaveBtn, false);
          }
      });
  }

  const sapBtn = document.getElementById('btn-connect-sap');
  const sapModalClose = document.getElementById('sap-modal-close');
  const sapModalCancel = document.getElementById('sap-modal-cancel');
  const sapModalSave = document.getElementById('sap-modal-save');
  const sapTestBtn = document.getElementById('btn-test-sap-connection');
  const btnExpandSapDesc = document.getElementById('btn-expand-sap-desc');
  const btnAnalyzeSap = document.getElementById('btn-analyze-sap-manual');
  const addSapParamBtn = document.getElementById('btn-add-sap-param');

  if (sapBtn) {
    const newSapBtn = sapBtn.cloneNode(true);
    sapBtn.parentNode.replaceChild(newSapBtn, sapBtn);

    newSapBtn.addEventListener('click', () => {
      resetModalState('sap');
      loadCategoriesIntoSelect('sap-category-select');
      
      const paramCont = document.getElementById('sap-params-container');
      if (paramCont) paramCont.innerHTML = '';
      addSapParameterRow(); // Add default empty row

      openModal('sap-integration-modal');
    });
  }

  const closeSapModal = () => closeModal('sap-integration-modal');
  if (sapModalClose) sapModalClose.onclick = closeSapModal;
  if (sapModalCancel) sapModalCancel.onclick = closeSapModal;

  if (addSapParamBtn) {
      addSapParamBtn.onclick = (e) => { e.preventDefault(); addSapParameterRow(); };
  }

  if (btnExpandSapDesc) {
      btnExpandSapDesc.onclick = (e) => {
          e.preventDefault();
          toggleFullscreenDescription(btnExpandSapDesc, 'sap-description-group');
      };
  }

  // Auto Generate for SAP
  if (btnAnalyzeSap) {
      btnAnalyzeSap.onclick = async (e) => {
          e.preventDefault();
          const descTextarea = document.getElementById('sap-description');
          // For SAP, we can't really "scan" easily without connecting.
          // But we can simulate or provide a template.
          // For now, let's try to ping the mock endpoint or just use the structure provided.
          
          const ashost = document.getElementById('sap-ashost')?.value;
          const sysnr = document.getElementById('sap-sysnr')?.value;
          const client = document.getElementById('sap-client')?.value;
          const user = document.getElementById('sap-user')?.value;
          const passwd = document.getElementById('sap-passwd')?.value;
          const func = document.getElementById('sap-function')?.value;

          if (!ashost || !user || !func) {
              showToast('ASHOST, User, and Function Name are required', 'warning');
              return;
          }

          const originalText = btnAnalyzeSap.innerHTML;
          btnAnalyzeSap.innerHTML = 'Scanning...';
          btnAnalyzeSap.disabled = true;
          startDescriptionProgress('sap');

          try {
              const response = await apiFetch('/admin/integrations/analyze-sap', {
                  method: 'POST',
                  body: JSON.stringify({ ashost, sysnr, client, user, passwd, functionName: func })
              });

              if (response.success) {
                  descTextarea.value = response.description;
                  showToast('Description generated!', 'success');
                  finishDescriptionProgress(true);
              } else {
                  descTextarea.value = "Analysis failed: " + response.error;
                  showToast('Analysis failed', 'error');
                  finishDescriptionProgress(false, response.error);
              }
          } catch (error) {
              descTextarea.value = "Analysis error: " + error.message;
              showToast('Analysis error', 'error');
              finishDescriptionProgress(false, error.message);
          } finally {
              btnAnalyzeSap.innerHTML = originalText;
              btnAnalyzeSap.disabled = false;
          }
      };
  }

  // Test SAP Connection
  if (sapTestBtn) {
      sapTestBtn.onclick = async (e) => {
          e.preventDefault();
          const ashost = document.getElementById('sap-ashost')?.value;
          const sysnr = document.getElementById('sap-sysnr')?.value;
          const client = document.getElementById('sap-client')?.value;
          const user = document.getElementById('sap-user')?.value;
          const passwd = document.getElementById('sap-passwd')?.value;
          
          if (!ashost || !user) {
              showToast('Host and User are required', 'warning');
              return;
          }

          const originalText = sapTestBtn.innerHTML;
          sapTestBtn.innerHTML = 'Testing...';
          sapTestBtn.disabled = true;

          try {
              const response = await apiFetch('/admin/integrations/test-sap', {
                  method: 'POST',
                  body: JSON.stringify({ ashost, sysnr, client, user, passwd })
              });

              if (response.success) {
                  showToast('SAP Connection Successful!', 'success');
              } else {
                  showToast('Connection Failed: ' + (response.error || 'Unknown'), 'error');
              }
          } catch (error) {
              showToast('Connection Failed: ' + error.message, 'error');
          } finally {
              sapTestBtn.innerHTML = originalText;
              sapTestBtn.disabled = false;
          }
      };
  }

  // Save SAP Integration
  if (sapModalSave) {
      const newSapSaveBtn = sapModalSave.cloneNode(true);
      sapModalSave.parentNode.replaceChild(newSapSaveBtn, sapModalSave);

      newSapSaveBtn.addEventListener('click', async () => {
          const name = document.getElementById('sap-name')?.value;
          const ashost = document.getElementById('sap-ashost')?.value;
          const sysnr = document.getElementById('sap-sysnr')?.value;
          const client = document.getElementById('sap-client')?.value;
          const user = document.getElementById('sap-user')?.value;
          const passwd = document.getElementById('sap-passwd')?.value;
          const func = document.getElementById('sap-function')?.value;
          const description = document.getElementById('sap-description')?.value;
          const category_id = document.getElementById('sap-category-select')?.value;

          if (!name || !ashost || !user || !func || !description) {
              showToast('Please fill all required fields', 'warning');
              return;
          }

          // Collect Parameters
          const parameters = [];
          document.querySelectorAll('.sap-param-row').forEach(row => {
              const pName = row.querySelector('.param-name')?.value.trim();
              const pDesc = row.querySelector('.param-desc')?.value.trim();
              
              if (pName) {
                  parameters.push({
                      name: pName,
                      description: pDesc,
                      type: 'string', // Default for BAPI params usually
                      required: true
                  });
              }
          });

          setButtonLoading(newSapSaveBtn, true);

          const requestMethod = currentEditId ? 'PUT' : 'POST';
          const endpoint = currentEditId 
              ? `/admin/integrations/${currentEditId}` 
              : '/admin/integrations/sap'; 

          try {
              const body = {
                  name,
                  description,
                  source_type: 'sap_bapi',
                  category_id: category_id || null,
                  sap_config: {
                      ashost, sysnr, client, user, passwd, 
                      functionName: func,
                      parameters
                  }
              };

              const response = await apiFetch(endpoint, {
                  method: requestMethod,
                  body: JSON.stringify(body)
              });

              showToast(response.message || 'SAP BAPI connected successfully', 'success');
              closeSapModal();
              loadIntegrationData();
          } catch (error) {
              showToast(error.message || 'Failed to save SAP BAPI', 'error');
          } finally {
              setButtonLoading(newSapSaveBtn, false);
          }
      });
  }

  // ==========================================
  // 4. SOURCE VIEW MODAL
  // ==========================================
  const viewCloseBtn = document.getElementById('source-view-close');
  const viewCloseFooter = document.getElementById('source-view-close-btn');
  const closeViewModal = () => closeModal('source-view-modal');
  
  if (viewCloseBtn) viewCloseBtn.onclick = closeViewModal;
  if (viewCloseFooter) viewCloseFooter.onclick = closeViewModal;

  // ==========================================
  // 5. FILTERS
  // ==========================================
  const searchInput = document.getElementById('source-search');
  const typeFilter = document.getElementById('source-type-filter');
  const thName = document.getElementById('th-source-name');
  const thType = document.getElementById('th-type');

  if (searchInput) {
      searchInput.addEventListener('input', () => { renderSourcesTable(); renderInternalFlagsTable(); });
  }
  if (typeFilter) {
      typeFilter.addEventListener('change', () => renderSourcesTable());
  }
  if (thName) {
      thName.addEventListener('click', () => {
          if (sortField === 'name') {
              sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
              sortField = 'name';
              sortDirection = 'asc';
          }
          updateSortHeaders();
          renderSourcesTable();
      });
  }
  if (thType) {
      thType.addEventListener('click', () => {
          if (sortField === 'source_type') {
              sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
              sortField = 'source_type';
              sortDirection = 'asc';
          }
          updateSortHeaders();
          renderSourcesTable();
      });
  }
  updateSortHeaders();
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function resetModalState(type) {
    currentEditId = null;
    
    if (type === 'sheet') {
        safeSetValue('sheet-url', '');
        safeSetValue('sheet-name', '');
        safeSetValue('sheet-description', '');
        safeSetValue('sheet-category-select', '');
        
        document.getElementById('sheet-modal-title').textContent = 'Connect Google Sheet';
        const saveBtn = document.getElementById('sheet-modal-save');
        if (saveBtn) {
            const btnText = saveBtn.querySelector('.btn-text');
            if (btnText) btnText.innerHTML = '<span class="material-symbols-outlined">link</span> Link Sheet';
        }
    } else if (type === 'api') {
        safeSetValue('api-name', '');
        safeSetValue('api-method', 'GET');
        safeSetValue('api-url', '');
        safeSetValue('api-description', '');
        safeSetValue('api-category-select', '');
        
        document.getElementById('api-modal-title').textContent = 'Connect External API';
        const saveBtn = document.getElementById('api-modal-save');
        if (saveBtn) {
            const btnText = saveBtn.querySelector('.btn-text');
            if (btnText) btnText.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">api</span> Connect API';
        }
    } else if (type === 'database') {
        safeSetValue('db-name', '');
        safeSetValue('db-type', 'mysql');
        safeSetValue('db-host', '');
        safeSetValue('db-port', '');
        safeSetValue('db-database', '');
        safeSetValue('db-user', '');
        safeSetValue('db-password', '');
        safeSetValue('db-description', '');
        safeSetValue('db-category-select', '');
        
        document.getElementById('db-modal-title').textContent = 'Connect Database';
        const saveBtn = document.getElementById('db-modal-save');
        if (saveBtn) {
            const btnText = saveBtn.querySelector('.btn-text');
            if (btnText) btnText.innerHTML = '<span class="material-symbols-outlined">database</span> Connect Database';
        }
    } else if (type === 'sap') {
        safeSetValue('sap-name', '');
        safeSetValue('sap-ashost', '');
        safeSetValue('sap-sysnr', '00');
        safeSetValue('sap-client', '100');
        safeSetValue('sap-user', '');
        safeSetValue('sap-passwd', '');
        safeSetValue('sap-function', '');
        safeSetValue('sap-description', '');
        safeSetValue('sap-category-select', '');
        
        document.getElementById('sap-modal-title').textContent = 'Connect SAP BAPI';
        const saveBtn = document.getElementById('sap-modal-save');
        if (saveBtn) {
            const btnText = saveBtn.querySelector('.btn-text');
            if (btnText) btnText.innerHTML = '<span class="material-symbols-outlined">dns</span> Connect SAP';
        }
    }
}

function safeSetValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

async function loadCategoriesIntoSelect(elementId) {
    const select = document.getElementById(elementId);
    if (!select) return;

    try {
        select.disabled = false;
        // Only reload if empty or just has placeholder
        if (select.options.length <= 1) { 
             select.innerHTML = '<option>Loading...</option>';
        } else {
             return;
        }
        
        const data = await apiFetch('/admin/categories');
        
        if (!data.categories || data.categories.length === 0) {
            select.innerHTML = '<option value="">None (Create categories in Knowledge Base)</option>';
        } else {
            select.innerHTML = '<option value="">None (General Tool)</option>' + 
            data.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        }
    } catch(e) { 
        console.error("Error loading categories:", e);
        select.innerHTML = '<option value="">Error loading categories</option>';
    }
}

// Toggle Fullscreen Description (Generic)
function toggleFullscreenDescription(btn, groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    
    const textarea = group.querySelector('textarea');
    
    if (group.classList.contains('fullscreen-mode')) {
        group.classList.remove('fullscreen-mode');
        btn.innerHTML = `<span class="material-symbols-outlined">open_in_full</span> Expand`;
    } else {
        group.classList.add('fullscreen-mode');
        btn.innerHTML = `<span class="material-symbols-outlined">close_fullscreen</span> Collapse`;
        if (textarea) textarea.focus();
    }
}

async function handleAnalyzeClick(btn, textarea, urlInputId) {
    const url = document.getElementById(urlInputId)?.value;

    if (!url) {
        showToast('Please enter the URL first', 'warning');
        return;
    }

    let payload = { url };
    
    if (urlInputId === 'api-url') {
        const method = document.getElementById('api-method')?.value || 'GET';
        const headers = {};
        document.querySelectorAll('.header-row').forEach(row => {
            const keyInput = row.querySelector('.header-key');
            const valInput = row.querySelector('.header-val');
            if (keyInput && valInput && keyInput.value.trim()) {
                headers[keyInput.value.trim()] = valInput.value.trim();
            }
        });

        payload = { url, source_type: 'external_api', method, headers };
    } else if (urlInputId === 'sheet-url') {
        payload = { url, source_type: 'google_sheet' };
    } else {
        payload = { url, source_type: 'unknown' };
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = 'Scanning...';
    btn.disabled = true;
    textarea.value = "";

    try {
        const data = await apiFetch('/admin/integrations/analyze-sheet', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (data.success) {
            textarea.value = data.description;
            
            const match = data.description.match(/(?:API TOOL|DATASET):\s*(.*?)\n/i);
            if (match && match[1]) {
                const generatedName = match[1].trim();
                
                const nameInputId = urlInputId === 'api-url' ? 'api-name' : 'sheet-name';
                const nameInput = document.getElementById(nameInputId);
                
                if (nameInput && !nameInput.value.trim()) {
                    nameInput.value = generatedName;
                    showToast(`Name auto-filled: ${generatedName}`, 'info');
                }
            }

            showToast('Description generated!', 'success');
            finishDescriptionProgress(true);
        } else if (data.warning) {
             textarea.value = `Description generation skipped: ${data.warning}`;
             showToast('Warning: ' + data.warning, 'warning');
             finishDescriptionProgress(false, data.warning);
        }
    } catch (error) {
        console.error(error);
        textarea.value = "";
        showToast('Failed to analyze. Check connection.', 'error');
        finishDescriptionProgress(false, error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function startDescriptionProgress(kind) {
    if (descProgressRunning) return;
    descProgressRunning = true;
    descPhaseIndex = 0;
    const title = document.getElementById('desc-progress-title');
    const msg = document.getElementById('desc-progress-message');
    const sub = document.getElementById('desc-progress-subtext');
    const fill = document.getElementById('desc-progress-fill');
    const pct = document.getElementById('desc-progress-text');
    const loading = document.getElementById('desc-progress-loading');
    const result = document.getElementById('desc-progress-result');
    const error = document.getElementById('desc-progress-error');
    const cancelBtn = document.getElementById('desc-progress-cancel');
    const finishBtn = document.getElementById('desc-progress-finish');
    const closeBtn = document.getElementById('desc-progress-close');
    if (title) title.textContent = 'Generating AI Description';
    if (msg) msg.textContent = 'Initializing...';
    if (sub) sub.textContent = 'The assistant is analyzing your source and drafting a label.';
    if (fill) fill.style.width = '0%';
    if (pct) pct.textContent = '0% Complete';
    if (loading) loading.style.display = 'block';
    if (result) result.style.display = 'none';
    if (error) error.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    if (closeBtn) closeBtn.style.display = 'none';
    openModal('description-progress-modal');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            descProgressRunning = false;
            if (descPhaseTimer) {
                clearInterval(descPhaseTimer);
                descPhaseTimer = null;
            }
            closeModal('description-progress-modal');
        };
    }
    if (finishBtn) {
        finishBtn.onclick = () => {
            closeModal('description-progress-modal');
        };
    }
    if (closeBtn) {
        closeBtn.onclick = () => {
            closeModal('description-progress-modal');
        };
    }
    if (kind === 'api') {
        descPhaseSteps = [
            'Fetching endpoint metadata...',
            'Analyzing headers and auth...',
            'Extracting parameters...',
            'Understanding response schema...',
            'Drafting description...',
            'Refining phrasing...',
            'Finalizing...'
        ];
    } else if (kind === 'sheet') {
        descPhaseSteps = [
            'Loading sheet metadata...',
            'Scanning columns and headers...',
            'Detecting categories...',
            'Sampling rows...',
            'Drafting description...',
            'Refining phrasing...',
            'Finalizing...'
        ];
    } else if (kind === 'db') {
        descPhaseSteps = [
            'Connecting to database...',
            'Profiling tables...',
            'Mapping relationships...',
            'Analyzing columns...',
            'Generating summary...',
            'Drafting description...',
            'Finalizing...'
        ];
    } else {
        descPhaseSteps = [
            'Initializing...',
            'Analyzing function interface...',
            'Identifying input parameters...',
            'Understanding output tables...',
            'Drafting description...',
            'Refining phrasing...',
            'Finalizing...'
        ];
    }
    let progress = 0;
    descPhaseTimer = setInterval(() => {
        if (!msg || !fill || !pct) return;
        const step = descPhaseSteps[Math.min(descPhaseIndex, descPhaseSteps.length - 1)];
        msg.textContent = step;
        descPhaseIndex += 1;
        progress = Math.min(progress + 12, 85);
        fill.style.width = progress + '%';
        pct.textContent = Math.round(progress) + '% Complete';
    }, 900);
}

function finishDescriptionProgress(success, detail) {
    if (!descProgressRunning) return;
    descProgressRunning = false;
    if (descPhaseTimer) {
        clearInterval(descPhaseTimer);
        descPhaseTimer = null;
    }
    const loading = document.getElementById('desc-progress-loading');
    const result = document.getElementById('desc-progress-result');
    const error = document.getElementById('desc-progress-error');
    const fill = document.getElementById('desc-progress-fill');
    const pct = document.getElementById('desc-progress-text');
    const cancelBtn = document.getElementById('desc-progress-cancel');
    const finishBtn = document.getElementById('desc-progress-finish');
    const closeBtn = document.getElementById('desc-progress-close');
    if (fill) fill.style.width = '100%';
    if (pct) pct.textContent = '100% Complete';
    if (loading) loading.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'inline-block';
    if (closeBtn) closeBtn.style.display = 'inline-block';
    if (success) {
        if (result) result.style.display = 'block';
        if (error) error.style.display = 'none';
    } else {
        if (result) result.style.display = 'none';
        if (error) error.style.display = 'block';
        const sub = document.getElementById('desc-error-subtext');
        if (sub && detail) sub.textContent = detail;
    }
}
function addHeaderRow(key = '', val = '') {
    const container = document.getElementById('api-headers-container');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'dynamic-row header-row';
    div.innerHTML = `
        <input type="text" class="form-control header-key" placeholder="Key" value="${key}" style="flex:1;" autocomplete="off">
        <input type="text" class="form-control header-val" placeholder="Value" value="${val}" style="flex:1;" autocomplete="off">
        <button class="btn btn-danger btn-icon remove-row" style="padding: 8px 12px;">✕</button>
    `;
    div.querySelector('.remove-row').onclick = () => div.remove();
    container.appendChild(div);
}

function addParameterRow(param = {}) {
    const container = document.getElementById('api-params-container');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'dynamic-row param-row';
    div.innerHTML = `
        <input type="text" class="form-control param-name" placeholder="Name" value="${param.name || ''}" style="flex:1; min-width: 80px;" autocomplete="off">
        <select class="form-control param-type" style="width:80px;">
            <option value="string" ${param.type === 'string' ? 'selected' : ''}>String</option>
            <option value="number" ${param.type === 'number' ? 'selected' : ''}>Number</option>
            <option value="boolean" ${param.type === 'boolean' ? 'selected' : ''}>Bool</option>
        </select>
        <select class="form-control param-in" style="width:80px;">
            <option value="query" ${param.in === 'query' ? 'selected' : ''}>Query</option>
            <option value="path" ${param.in === 'path' ? 'selected' : ''}>Path</option>
            <option value="body" ${param.in === 'body' ? 'selected' : ''}>Body</option>
        </select>
        <input type="text" class="form-control param-desc" placeholder="Description" value="${param.description || ''}" style="flex:2; min-width: 100px;" autocomplete="off">
        <button class="btn btn-danger btn-icon remove-row" style="padding: 8px 12px;">✕</button>
    `;
    div.querySelector('.remove-row').onclick = () => div.remove();
    container.appendChild(div);
}

function addSapParameterRow(param = {}) {
    const container = document.getElementById('sap-params-container');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'dynamic-row sap-param-row';
    div.innerHTML = `
        <input type="text" class="form-control param-name" placeholder="SAP Param Name" value="${param.name || ''}" style="flex:1; min-width: 120px;" autocomplete="off">
        <input type="text" class="form-control param-desc" placeholder="User Input Description (e.g. 'Customer ID')" value="${param.description || ''}" style="flex:2;" autocomplete="off">
        <button class="btn btn-danger btn-icon remove-row" style="padding: 8px 12px;">✕</button>
    `;
    div.querySelector('.remove-row').onclick = () => div.remove();
    container.appendChild(div);
}

// Load integration data
async function loadIntegrationData() {
  const liveTbody = document.getElementById('live-sources-table-body');
  const flagsTbody = document.getElementById('internal-flags-table-body');
  const skeleton = document.getElementById('integrations-skeleton');
  const content = document.getElementById('integrations-content');

  // Show Skeleton
  if (skeleton && content) {
    content.style.display = 'none';
    skeleton.style.display = 'block';
  }
  
  try {
    const data = await apiFetch('/admin/integrations');
    allSources = data.sources || [];
    renderSourcesTable();
    renderInternalFlagsTable();
  } catch (error) {
    console.error(error);
    if (liveTbody) liveTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Failed to load sources.</td></tr>';
    if (flagsTbody) flagsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Failed to load system flags.</td></tr>';
  } finally {
      // Hide Skeleton
      if (skeleton && content) {
          content.style.display = 'block';
          skeleton.style.display = 'none';
      }
  }
}

function renderSourcesTable() {
    const tbody = document.getElementById('live-sources-table-body');
    const search = document.getElementById('source-search').value.toLowerCase();
    const type = document.getElementById('source-type-filter').value;

    if (!allSources || allSources.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#999;">No live data sources connected.</td></tr>';
        return;
    }

    const filtered = allSources.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(search) || s.description.toLowerCase().includes(search);
        const isLiveType = s.source_type === 'google_sheet' || s.source_type === 'external_api' || s.source_type === 'database' || s.source_type === 'sap_bapi';
        const matchesType = type ? s.source_type === type : true;
        return isLiveType && matchesSearch && matchesType;
    });

    if (sortField) {
        filtered.sort((a, b) => {
            const av = String(a[sortField] || '').toLowerCase();
            const bv = String(b[sortField] || '').toLowerCase();
            return sortDirection === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No matching sources found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(source => {
        let typeBadge = '';
        if (source.source_type === 'google_sheet') {
            typeBadge = '<span class="badge badge-info">Google Sheet</span>';
        } else if (source.source_type === 'database') {
            typeBadge = '<span class="badge badge-info" style="background:#e0f2fe; color:#0284c7;">Database</span>';
        } else if (source.source_type === 'external_api') {
            typeBadge = '<span class="badge badge-warning" style="background:#f3e8ff; color:#9333ea; border:1px solid #d8b4fe;">External API</span>';
        } else if (source.source_type === 'sap_bapi') {
            typeBadge = '<span class="badge badge-warning" style="background:#fff7ed; color:#ea580c; border:1px solid #fed7aa;">SAP BAPI</span>';
        } else if (source.source_type === 'internal_flag') {
            typeBadge = '<span class="badge badge-secondary">Internal Flag</span>';
        } else {
            typeBadge = `<span class="badge badge-secondary">${escapeHtml(source.source_type || 'Unknown')}</span>`;
        }

        return `
      <tr>
        <td data-label="Source Name">
            <div>
                <strong>${escapeHtml(source.name)}</strong>
                ${source.category_name ? `<div style="color:#666; display:flex; align-items:center; gap:4px; font-size:0.75rem; margin-top:2px;"><span class="material-symbols-outlined" style="font-size: 12px;">folder</span> ${escapeHtml(source.category_name)}</div>` : ''}
            </div>
        </td>
        <td data-label="Type">${typeBadge}</td>
        <td data-label="Description" class="description-cell" title="${escapeHtml(source.description)}">
          <div class="truncate-wrapper">${escapeHtml(source.description)}</div>
        </td>
        <td data-label="Last Synced">${formatDateTime(source.updated_at)}</td>
        <td data-label="Actions">
          <div class="action-buttons">
            <button class="action-btn action-btn-view" onclick="Integrations.viewLiveSource(${source.id})">
                <span class="material-symbols-outlined">visibility</span> View
            </button>
            <button class="action-btn action-btn-edit" onclick="Integrations.editLiveSource(${source.id})">
                <span class="material-symbols-outlined">edit</span> Edit
            </button>
            <button class="action-btn action-btn-disconnect" onclick="Integrations.deleteLiveSource(${source.id})">
                <span class="material-symbols-outlined">link_off</span> Disconnect
            </button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
}

function renderInternalFlagsTable() {
    const tbody = document.getElementById('internal-flags-table-body');
    if (!tbody) return;
    const search = document.getElementById('source-search').value.toLowerCase();

    const flags = (allSources || []).filter(s => {
        const isFlag = s.source_type === 'internal_flag';
        const matchesSearch = s.name.toLowerCase().includes(search) || s.description.toLowerCase().includes(search);
        return isFlag && matchesSearch;
    });

    if (flags.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No system flags found.</td></tr>';
        return;
    }

    tbody.innerHTML = flags.map(source => {
        const typeBadge = '<span class="badge badge-secondary">Internal Flag</span>';
        return `
      <tr>
        <td data-label="Flag Name"><strong>${escapeHtml(source.name)}</strong></td>
        <td data-label="Type">${typeBadge}</td>
        <td data-label="Description" class="description-cell" title="${escapeHtml(source.description)}">
          <div class="truncate-wrapper">${escapeHtml(source.description)}</div>
        </td>
        <td data-label="Last Updated">${formatDateTime(source.updated_at)}</td>
      </tr>
    `;
    }).join('');
}

function updateSortHeaders() {
    const thName = document.getElementById('th-source-name');
    const thType = document.getElementById('th-type');
    if (thName) {
        const indicator = sortField === 'name' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
        thName.textContent = `Source Name${indicator}`;
    }
    if (thType) {
        const indicator = sortField === 'source_type' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
        thType.textContent = `Type${indicator}`;
    }
}
function viewLiveSource(id) {
    const source = allSources.find(s => s.id === id);
    if (!source) return;

    document.getElementById('source-view-title').textContent = source.name;
    document.getElementById('source-view-description').textContent = source.description;
    
    let configHtml = '';
    try {
        const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
        configHtml = `<pre>${JSON.stringify(config, null, 2)}</pre>`;
    } catch(e) {
        configHtml = 'Invalid Config';
    }
    document.getElementById('source-view-config').innerHTML = configHtml;
    
    openModal('source-view-modal');
}

async function editLiveSource(id) {
    const source = allSources.find(s => s.id === id);
    if (!source) return;

    // Set Edit State
    currentEditId = id;

    if (source.source_type === 'google_sheet') {
        // Prepare Sheet Modal for Edit
        await loadCategoriesIntoSelect('sheet-category-select');
        
        document.getElementById('sheet-modal-title').textContent = 'Edit Google Sheet';
        const saveBtn = document.getElementById('sheet-modal-save');
        if (saveBtn) {
            const btnText = saveBtn.querySelector('.btn-text');
            if (btnText) btnText.textContent = 'Save Changes';
        }

        safeSetValue('sheet-name', source.name);
        safeSetValue('sheet-description', source.description);
        safeSetValue('sheet-category-select', source.category_id || '');
        
        try {
            const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
            safeSetValue('sheet-url', config.sheet_url || '');
        } catch(e) {}

        openModal('sheet-integration-modal');

    } else if (source.source_type === 'database') {
        // Prepare DB Modal for Edit
        await loadCategoriesIntoSelect('db-category-select');
        
        document.getElementById('db-modal-title').textContent = 'Edit Database Connection';
        const saveBtn = document.getElementById('db-modal-save');
        if (saveBtn) {
            const btnText = saveBtn.querySelector('.btn-text');
            if (btnText) btnText.textContent = 'Save Changes';
        }

        safeSetValue('db-name', source.name);
        safeSetValue('db-description', source.description);
        safeSetValue('db-category-select', source.category_id || '');

        try {
            const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
            const dbConfig = config.db_config || config; 

            safeSetValue('db-type', dbConfig.type || 'mysql');
            safeSetValue('db-host', dbConfig.host || '');
            safeSetValue('db-port', dbConfig.port || '');
            safeSetValue('db-database', dbConfig.database || '');
            safeSetValue('db-user', dbConfig.user || '');
            safeSetValue('db-password', ''); 
        } catch(e) {
            console.error("Error parsing db config", e);
        }

        openModal('db-integration-modal');

    } else if (source.source_type === 'external_api') {
        // Prepare API Modal for Edit
        await loadCategoriesIntoSelect('api-category-select');
        
        document.getElementById('api-modal-title').textContent = 'Edit External API';
        const saveBtn = document.getElementById('api-modal-save');
        if (saveBtn) {
            const btnText = saveBtn.querySelector('.btn-text');
            if (btnText) btnText.textContent = 'Save Changes';
        }

        safeSetValue('api-name', source.name);
        safeSetValue('api-description', source.description);
        safeSetValue('api-category-select', source.category_id || '');

        try {
            const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
            safeSetValue('api-url', config.endpoint || '');
            safeSetValue('api-method', config.method || 'GET');

            // Populate Headers
            const headerCont = document.getElementById('api-headers-container');
            headerCont.innerHTML = '';
            if (config.headers) {
                Object.entries(config.headers).forEach(([key, val]) => addHeaderRow(key, val));
            } else {
                addHeaderRow(); 
            }

            // Populate Params
            const paramCont = document.getElementById('api-params-container');
            paramCont.innerHTML = '';
            if (config.parameters && Array.isArray(config.parameters)) {
                config.parameters.forEach(p => addParameterRow(p));
            } else {
                addParameterRow();
            }

        } catch(e) {
            console.error("Error parsing config for edit", e);
        }

        openModal('api-integration-modal');
    } else if (source.source_type === 'sap_bapi') {
        // Prepare SAP Modal for Edit
        await loadCategoriesIntoSelect('sap-category-select');
        
        document.getElementById('sap-modal-title').textContent = 'Edit SAP Connection';
        const saveBtn = document.getElementById('sap-modal-save');
        if (saveBtn) {
            const btnText = saveBtn.querySelector('.btn-text');
            if (btnText) btnText.textContent = 'Save Changes';
        }

        safeSetValue('sap-name', source.name);
        safeSetValue('sap-description', source.description);
        safeSetValue('sap-category-select', source.category_id || '');

        try {
            const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
            const sapConfig = config.sap_config || config;

            safeSetValue('sap-ashost', sapConfig.ashost || '');
            safeSetValue('sap-sysnr', sapConfig.sysnr || '');
            safeSetValue('sap-client', sapConfig.client || '');
            safeSetValue('sap-user', sapConfig.user || '');
            safeSetValue('sap-passwd', ''); 
            safeSetValue('sap-function', sapConfig.functionName || '');

            // Populate Params
            const paramCont = document.getElementById('sap-params-container');
            paramCont.innerHTML = '';
            if (sapConfig.parameters && Array.isArray(sapConfig.parameters)) {
                sapConfig.parameters.forEach(p => addSapParameterRow(p));
            } else {
                addSapParameterRow();
            }

        } catch(e) {
            console.error("Error parsing sap config", e);
        }

        openModal('sap-integration-modal');
    }
}

async function deleteLiveSource(id) {
  const s = allSources.find(src => src.id === id);
  const name = s ? escapeHtml(s.name) : 'this source';
  showConfirmationModal({
    title: 'Disconnect Source',
    message: `Disconnect <strong>${name}</strong>?`,
    confirmText: 'Disconnect',
    confirmType: 'danger',
    onConfirm: async () => {
      try {
        await apiFetch(`/admin/integrations/${id}`, { method: 'DELETE' });
        showToast('Source disconnected');
        loadIntegrationData();
      } catch (e) {
        showToast('Failed to delete source', 'error');
      }
    }
  });
}

const Integrations = {
  setupIntegrationsView,
  loadIntegrationData,
  deleteLiveSource,
  viewLiveSource,
  editLiveSource
};

window.Integrations = Integrations;

export {
  setupIntegrationsView,
  loadIntegrationData,
  Integrations
};
