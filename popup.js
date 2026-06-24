(function() {
  "use strict";

  // ===== CONSTANTS =====
  const STORAGE_KEY = 'holderData';
  const DRAFT_KEY = 'holderDraft';

  // ===== DATA MANAGEMENT =====
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
            projects: Array.isArray(parsed.projects) ? parsed.projects : [],
            settings: parsed.settings || { darkMode: false }
          };
        }
      }
    } catch (_) {}
    return { accounts: [], projects: [], settings: { darkMode: false } };
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ===== DRAFT MANAGEMENT =====
  function saveDraft(type, values) {
    const draft = { type, values, timestamp: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.timestamp && (Date.now() - parsed.timestamp) < 300000) {
          return parsed;
        }
      }
    } catch (_) {}
    return null;
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
  }

  // ===== HELPERS =====
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>"]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      if (m === '"') return '&quot;';
      return m;
    });
  }

  function generatePassword(length) {
    length = parseInt(length) || 12;
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('Copied to clipboard!');
    }).catch(function() {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('Copied to clipboard!');
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: #1d2d44;
      color: white;
      padding: 0.4rem 1rem;
      border-radius: 30px;
      font-size: 0.7rem;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: fadeInUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function() {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  }

  // ===== STATE =====
  let data = loadData();
  let timerInterval = null;

  // ===== RENDER FUNCTIONS =====

  function renderAccounts(searchTerm) {
    const container = document.getElementById('accountList');
    const countSpan = document.getElementById('accountCount');
    if (!container) return;

    let accounts = data.accounts || [];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      accounts = accounts.filter(function(acc) {
        return acc.email.toLowerCase().includes(term) || 
               (acc.category && acc.category.toLowerCase().includes(term));
      });
    }

    countSpan.textContent = data.accounts.length;

    if (accounts.length === 0) {
      container.innerHTML = '<div class="empty-message">✨ No accounts found.</div>';
      return;
    }

    const now = Date.now();
    const sorted = [...accounts].sort((a, b) => {
      const aBlocked = (a.blockUntil || 0) > now;
      const bBlocked = (b.blockUntil || 0) > now;
      if (aBlocked && !bBlocked) return -1;
      if (!aBlocked && bBlocked) return 1;
      return 0;
    });

    let html = '';
    for (const acc of sorted) {
      const isBlocked = (acc.blockUntil || 0) > now;
      let remainingDisplay = 'free';
      let badgeClass = 'timer-badge';
      if (isBlocked) {
        const diff = acc.blockUntil - now;
        const seconds = Math.ceil(diff / 1000);
        if (seconds > 3600) {
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          remainingDisplay = h + 'h ' + m + 'm';
        } else if (seconds > 60) {
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          remainingDisplay = m + 'm ' + s + 's';
        } else {
          remainingDisplay = seconds + 's';
        }
        badgeClass += ' limit-hit';
      } else {
        if (acc.usedAt) {
          const usedDate = new Date(acc.usedAt);
          const timeStr = usedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          remainingDisplay = 'last use ' + timeStr;
        } else {
          remainingDisplay = 'ready';
        }
      }

      let actionBtnText = isBlocked ? '🔓 Unblock' : '⛔ Use';
      const actionBtnClass = isBlocked ? 'btn-outline' : 'btn-success';
      const minutes = acc.cooldownMinutes || 60;
      const category = acc.category || '';

      html += `
        <div class="account-card ${isBlocked ? 'blocked' : ''}" data-account-id="${acc.id}">
          <div class="account-info">
            <div class="account-email">
              ${escapeHtml(acc.email)}
              ${category ? '<span class="tag">' + escapeHtml(category) + '</span>' : ''}
            </div>
            <div style="display:flex; align-items:center; gap:0.2rem; flex-wrap:wrap;">
              <span class="account-password">${escapeHtml(acc.password)}</span>
              <button class="copy-btn" data-copy="${escapeHtml(acc.password)}" title="Copy password">📋</button>
              <button class="copy-btn" data-copy="${escapeHtml(acc.email)}" title="Copy email">✉️</button>
            </div>
          </div>
          <div class="timer-section">
            <span class="${badgeClass}">
              <span>⏱️</span> <i id="timerDisplay-${acc.id}">${remainingDisplay}</i>
            </span>
            <div style="display:flex; align-items:center; gap:0.15rem;">
              <input type="number" id="minutesInput-${acc.id}" value="${minutes}" min="1" max="1440" style="width:30px; padding:0.05rem 0.15rem; border:1px solid #d3dceb; border-radius:20px; font-size:0.55rem; text-align:center;">
              <label style="font-size:0.5rem;">m</label>
              <button class="btn btn-sm btn-outline update-minutes" data-id="${acc.id}">✓</button>
            </div>
            <div class="btn-group">
              <button class="btn ${actionBtnClass} action-use" data-id="${acc.id}">${actionBtnText}</button>
              <button class="btn btn-danger action-delete" data-id="${acc.id}">✕</button>
            </div>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
    updateDbStatus();
  }

  function renderProjects(searchTerm) {
    const container = document.getElementById('projectList');
    const countSpan = document.getElementById('projectCount');
    if (!container) return;

    let projects = data.projects || [];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      projects = projects.filter(function(proj) {
        return proj.name.toLowerCase().includes(term) ||
               (proj.note && proj.note.toLowerCase().includes(term));
      });
    }

    countSpan.textContent = data.projects.length;

    if (projects.length === 0) {
      container.innerHTML = '<div class="empty-message">📁 No projects yet. Add one above.</div>';
      return;
    }

    let html = '';
    for (const proj of projects) {
      const createdAt = proj.createdAt ? new Date(proj.createdAt).toLocaleDateString() : '';

      html += `
        <div class="project-card" data-project-id="${proj.id}">
          <div class="project-info">
            <div class="project-name">${escapeHtml(proj.name)}</div>
            <div style="display:flex; align-items:center; gap:0.3rem; flex-wrap:wrap;">
              ${proj.link ? '<a href="' + escapeHtml(proj.link) + '" target="_blank" class="project-link">🔗 ' + escapeHtml(proj.link) + '</a>' : '<span class="project-note" style="color:#8a8aaa;">No link</span>'}
              <button class="btn btn-sm btn-outline project-edit-link" data-id="${proj.id}" style="font-size:0.5rem;">✏️ Edit</button>
            </div>
            ${proj.note ? '<div class="project-note">📝 ' + escapeHtml(proj.note) + '</div>' : ''}
            ${createdAt ? '<div class="project-note" style="font-size:0.55rem;">📅 ' + createdAt + '</div>' : ''}
          </div>
          <div class="btn-group">
            ${proj.link ? '<button class="btn btn-outline btn-sm project-open" data-link="' + escapeHtml(proj.link) + '">🔗 Open</button>' : ''}
            <button class="btn btn-danger project-delete" data-id="${proj.id}">✕</button>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  }

  function renderSettings() {
    const settings = data.settings || { darkMode: false };
    document.getElementById('darkModeToggle').checked = settings.darkMode || false;
    
    if (settings.darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }

  function updateDbStatus() {
    const statusEl = document.getElementById('dbStatus');
    if (statusEl) {
      const count = data.accounts.length;
      statusEl.innerHTML = '💾 Accounts: <span id="accountCount">' + count + '</span>';
    }
  }

  // ===== TIMER UPDATE =====
  function updateTimers() {
    const now = Date.now();
    let anyChange = false;
    for (const acc of data.accounts) {
      const el = document.getElementById('timerDisplay-' + acc.id);
      if (!el) continue;
      const isBlocked = (acc.blockUntil || 0) > now;
      if (isBlocked) {
        const diff = acc.blockUntil - now;
        if (diff <= 0) {
          acc.blockUntil = 0;
          anyChange = true;
          el.textContent = 'free';
          const card = document.querySelector('.account-card[data-account-id="' + acc.id + '"]');
          if (card) {
            card.classList.remove('blocked');
            const useBtn = card.querySelector('.action-use');
            if (useBtn) {
              useBtn.textContent = '⛔ Use';
              useBtn.className = 'btn btn-success action-use';
            }
          }
          continue;
        }
        let display = '';
        const seconds = Math.ceil(diff / 1000);
        if (seconds > 3600) {
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          display = h + 'h ' + m + 'm';
        } else if (seconds > 60) {
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          display = m + 'm ' + s + 's';
        } else {
          display = seconds + 's';
        }
        el.textContent = display;
      } else {
        if (acc.usedAt) {
          const usedDate = new Date(acc.usedAt);
          const timeStr = usedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          el.textContent = 'last use ' + timeStr;
        } else {
          el.textContent = 'ready';
        }
      }
    }
    if (anyChange) {
      saveData(data);
      renderAccounts(document.getElementById('searchAccounts').value);
    }
  }

  // ===== CRUD OPERATIONS =====

  // --- Accounts ---
  function addAccount(email, password, minutes, category) {
    if (!email || !password) {
      alert('Please fill in both email and password.');
      return false;
    }
    if (!email.includes('@') || !email.includes('.')) {
      alert('Please enter a valid email address (contains @ and .)');
      return false;
    }
    const minVal = parseInt(minutes) || 60;
    if (minVal < 1) {
      alert('Minutes must be at least 1.');
      return false;
    }
    const exists = data.accounts.some(function(acc) {
      return acc.email.toLowerCase() === email.toLowerCase();
    });
    if (exists) {
      alert('Account with email "' + email + '" already exists.');
      return false;
    }
    const newAccount = {
      id: generateId(),
      email: email.trim(),
      password: password.trim(),
      category: category ? category.trim() : '',
      blockUntil: 0,
      usedAt: null,
      cooldownMinutes: minVal,
      createdAt: Date.now()
    };
    data.accounts.push(newAccount);
    saveData(data);
    clearDraft();
    renderAccounts(document.getElementById('searchAccounts').value);
    showToast('✅ Account added successfully!');
    return true;
  }

  function deleteAccount(id) {
    if (!confirm('Delete this account and its timer?')) return;
    data.accounts = data.accounts.filter(function(acc) {
      return acc.id !== id;
    });
    saveData(data);
    renderAccounts(document.getElementById('searchAccounts').value);
    showToast('🗑️ Account deleted');
  }

  function toggleUseAccount(id) {
    const now = Date.now();
    const account = data.accounts.find(function(acc) {
      return acc.id === id;
    });
    if (!account) return;

    const isBlocked = (account.blockUntil || 0) > now;

    if (isBlocked) {
      account.blockUntil = 0;
      account.usedAt = now;
      saveData(data);
      renderAccounts(document.getElementById('searchAccounts').value);
      return;
    }

    const minutes = account.cooldownMinutes || 60;
    const blockDurationMs = minutes * 60 * 1000;
    account.blockUntil = now + blockDurationMs;
    account.usedAt = now;
    saveData(data);
    renderAccounts(document.getElementById('searchAccounts').value);
    showToast('⏳ Account locked for ' + minutes + ' minutes');
  }

  function updateCooldownMinutes(id, minutes) {
    const account = data.accounts.find(function(acc) {
      return acc.id === id;
    });
    if (!account) return;
    const minVal = parseInt(minutes) || 60;
    if (minVal < 1) {
      alert('Minutes must be at least 1.');
      return;
    }
    account.cooldownMinutes = minVal;
    saveData(data);
    renderAccounts(document.getElementById('searchAccounts').value);
    showToast('✅ Cooldown updated to ' + minVal + ' minutes');
  }

  function resetAllTimers() {
    if (data.accounts.length === 0) {
      alert('No accounts to reset.');
      return;
    }
    if (!confirm('Reset all timers (unblock all accounts)?')) return;
    const now = Date.now();
    for (var i = 0; i < data.accounts.length; i++) {
      data.accounts[i].blockUntil = 0;
      data.accounts[i].usedAt = now;
    }
    saveData(data);
    renderAccounts(document.getElementById('searchAccounts').value);
    showToast('🔄 All timers reset');
  }

  function clearAllAccounts() {
    if (data.accounts.length === 0) {
      alert('No accounts to clear.');
      return;
    }
    if (!confirm('Delete ALL accounts and timers?')) return;
    data.accounts = [];
    saveData(data);
    renderAccounts(document.getElementById('searchAccounts').value);
    showToast('🗑️ All accounts cleared');
  }

  // --- Projects ---
  function addProject(name, link, note) {
    if (!name) {
      alert('Please enter a project name.');
      return false;
    }
    const newProject = {
      id: generateId(),
      name: name.trim(),
      link: link ? link.trim() : '',
      note: note ? note.trim() : '',
      createdAt: Date.now()
    };
    data.projects.push(newProject);
    saveData(data);
    renderProjects(document.getElementById('searchProjects').value);
    showToast('✅ Project added successfully!');
    return true;
  }

  function deleteProject(id) {
    if (!confirm('Delete this project?')) return;
    data.projects = data.projects.filter(function(proj) {
      return proj.id !== id;
    });
    saveData(data);
    renderProjects(document.getElementById('searchProjects').value);
    showToast('🗑️ Project deleted');
  }

  function editProjectLink(id) {
    const project = data.projects.find(function(proj) {
      return proj.id === id;
    });
    if (!project) return;
    
    const newLink = prompt('Enter new link for "' + project.name + '":', project.link || '');
    if (newLink === null) return;
    
    project.link = newLink.trim();
    saveData(data);
    renderProjects(document.getElementById('searchProjects').value);
    showToast('✅ Link updated!');
  }

  function clearAllProjects() {
    if (data.projects.length === 0) {
      alert('No projects to clear.');
      return;
    }
    if (!confirm('Delete ALL projects?')) return;
    data.projects = [];
    saveData(data);
    renderProjects(document.getElementById('searchProjects').value);
    showToast('🗑️ All projects cleared');
  }

  // --- Settings ---
  function updateSettings() {
    const darkMode = document.getElementById('darkModeToggle').checked;

    data.settings = {
      darkMode: darkMode
    };
    saveData(data);
    renderSettings();
    showToast('⚙️ Settings saved!');
  }

  // --- Export/Import ---
  function exportData() {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'holder_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('💾 Data exported!');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const imported = JSON.parse(e.target.result);
        if (imported && typeof imported === 'object') {
          if (Array.isArray(imported.accounts) && Array.isArray(imported.projects)) {
            if (!confirm('This will replace ALL current data. Continue?')) return;
            data = imported;
            saveData(data);
            renderAccounts('');
            renderProjects('');
            renderSettings();
            showToast('📂 Data imported successfully!');
          } else {
            alert('Invalid data format. Please select a valid backup file.');
          }
        }
      } catch (err) {
        alert('Error reading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ===== EVENT LISTENERS =====

  function setupEventListeners() {
    // --- Tab switching ---
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const tab = this.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(function(b) {
          b.classList.remove('active');
        });
        this.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(function(content) {
          content.classList.remove('active');
        });
        document.getElementById('tab-' + tab).classList.add('active');
        
        if (tab === 'accounts') {
          renderAccounts(document.getElementById('searchAccounts').value);
        } else if (tab === 'projects') {
          renderProjects(document.getElementById('searchProjects').value);
        } else if (tab === 'settings') {
          renderSettings();
        }
      });
    });

    // --- Search ---
    document.getElementById('searchAccounts').addEventListener('input', function() {
      renderAccounts(this.value);
    });
    document.getElementById('searchProjects').addEventListener('input', function() {
      renderProjects(this.value);
    });

    // --- Password Generator ---
    document.getElementById('generatePasswordBtn').addEventListener('click', function() {
      const length = document.getElementById('passwordLength').value || 12;
      const newPassword = generatePassword(parseInt(length));
      document.getElementById('newPassword').value = newPassword;
      showToast('🔑 Password generated!');
    });

    // --- Draft saving ---
    ['newEmail', 'newPassword', 'newMinutes', 'newCategory'].forEach(function(id) {
      document.getElementById(id).addEventListener('input', function() {
        const email = document.getElementById('newEmail').value;
        const password = document.getElementById('newPassword').value;
        const minutes = document.getElementById('newMinutes').value;
        const category = document.getElementById('newCategory').value;
        saveDraft('account', { email, password, minutes, category });
      });
    });

    ['newProjectName', 'newProjectLink', 'newProjectNote'].forEach(function(id) {
      document.getElementById(id).addEventListener('input', function() {
        const name = document.getElementById('newProjectName').value;
        const link = document.getElementById('newProjectLink').value;
        const note = document.getElementById('newProjectNote').value;
        saveDraft('project', { name, link, note });
      });
    });

    // --- Add Account ---
    document.getElementById('addAccountBtn').addEventListener('click', function() {
      const email = document.getElementById('newEmail').value;
      const password = document.getElementById('newPassword').value;
      const minutes = document.getElementById('newMinutes').value;
      const category = document.getElementById('newCategory').value;
      addAccount(email, password, minutes, category);
    });

    ['newEmail', 'newPassword', 'newMinutes', 'newCategory'].forEach(function(id) {
      document.getElementById(id).addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          document.getElementById('addAccountBtn').click();
        }
      });
    });

    // --- Add Project ---
    document.getElementById('addProjectBtn').addEventListener('click', function() {
      const name = document.getElementById('newProjectName').value;
      const link = document.getElementById('newProjectLink').value;
      const note = document.getElementById('newProjectNote').value;
      addProject(name, link, note);
    });

    ['newProjectName', 'newProjectLink', 'newProjectNote'].forEach(function(id) {
      document.getElementById(id).addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          document.getElementById('addProjectBtn').click();
        }
      });
    });

    // --- Account Actions ---
    document.getElementById('accountList').addEventListener('click', function(e) {
      const target = e.target.closest('button');
      if (!target) return;

      if (target.classList.contains('action-use')) {
        const id = target.getAttribute('data-id');
        if (id) toggleUseAccount(id);
        return;
      }

      if (target.classList.contains('action-delete')) {
        const id = target.getAttribute('data-id');
        if (id) deleteAccount(id);
        return;
      }

      if (target.classList.contains('update-minutes')) {
        const id = target.getAttribute('data-id');
        if (id) {
          const input = document.getElementById('minutesInput-' + id);
          if (input) {
            updateCooldownMinutes(id, input.value);
          }
        }
        return;
      }

      if (target.classList.contains('copy-btn')) {
        const text = target.getAttribute('data-copy');
        if (text) copyToClipboard(text);
        return;
      }
    });

    // --- Project Actions ---
    document.getElementById('projectList').addEventListener('click', function(e) {
      const target = e.target.closest('button');
      if (!target) return;

      if (target.classList.contains('project-delete')) {
        const id = target.getAttribute('data-id');
        if (id) deleteProject(id);
        return;
      }

      if (target.classList.contains('project-open')) {
        const link = target.getAttribute('data-link');
        if (link) {
          chrome.tabs.create({ url: link });
        }
        return;
      }

      if (target.classList.contains('project-edit-link')) {
        const id = target.getAttribute('data-id');
        if (id) editProjectLink(id);
        return;
      }
    });

    // --- Reset & Clear ---
    document.getElementById('resetAllBtn').addEventListener('click', resetAllTimers);
    document.getElementById('clearAllBtn').addEventListener('click', clearAllAccounts);
    document.getElementById('clearProjectsBtn').addEventListener('click', clearAllProjects);

    // --- Settings ---
    document.getElementById('darkModeToggle').addEventListener('change', updateSettings);

    // --- Export/Import ---
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', function() {
      document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', function(e) {
      if (this.files && this.files[0]) {
        importData(this.files[0]);
        this.value = '';
      }
    });

    // --- Auto-save draft on blur ---
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        const email = document.getElementById('newEmail').value;
        const password = document.getElementById('newPassword').value;
        const minutes = document.getElementById('newMinutes').value;
        const category = document.getElementById('newCategory').value;
        if (email || password || minutes || category) {
          saveDraft('account', { email, password, minutes, category });
        }
        const name = document.getElementById('newProjectName').value;
        const link = document.getElementById('newProjectLink').value;
        const note = document.getElementById('newProjectNote').value;
        if (name || link || note) {
          saveDraft('project', { name, link, note });
        }
      }
    });
  }

  // ===== INIT =====
  function init() {
    const draft = loadDraft();
    if (draft) {
      if (draft.type === 'account' && draft.values) {
        document.getElementById('newEmail').value = draft.values.email || '';
        document.getElementById('newPassword').value = draft.values.password || '';
        document.getElementById('newMinutes').value = draft.values.minutes || '';
        document.getElementById('newCategory').value = draft.values.category || '';
      } else if (draft.type === 'project' && draft.values) {
        document.getElementById('newProjectName').value = draft.values.name || '';
        document.getElementById('newProjectLink').value = draft.values.link || '';
        document.getElementById('newProjectNote').value = draft.values.note || '';
      }
    }

    renderAccounts('');
    renderProjects('');
    renderSettings();
    setupEventListeners();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimers, 1000);

    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        updateTimers();
        renderAccounts(document.getElementById('searchAccounts').value);
      }
    });

    setTimeout(updateTimers, 100);
  }

  window.addEventListener('beforeunload', function() {
    if (timerInterval) clearInterval(timerInterval);
  });

  init();

})();