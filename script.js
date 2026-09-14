(function(){
  // =====================================================================
  // CONFIGURARE BAZĂ DE DATE — editează linia de mai jos cu URL-ul tău
  // Firebase Realtime Database (ex: "https://numele-tau-default-rtdb.firebaseio.com")
  // Lasă-l gol ("") ca aplicația să funcționeze doar local, în acest browser.
  // =====================================================================
  const FIREBASE_URL_RAW = "https://parfumuri-4543a-default-rtdb.firebaseio.com/";
  const FIREBASE_URL = FIREBASE_URL_RAW.replace(/\/+$/, '');
  // =====================================================================

  // =====================================================================
  // AUTENTIFICARE — cheia ta Firebase Web API (nu e secretă, poate fi publică)
  // =====================================================================
  const FIREBASE_API_KEY = "AIzaSyD0Q-I1z4bLEPJNG7rTbQ-Y41nkPXInf-g";
  let authToken = null;   // token-ul de sesiune, când ești logat (null = neautentificat)
  let userEmail = null;   // emailul contului logat, pentru afișare
  // =====================================================================

  const STORAGE_KEY = 'palettes'; // NU redenumi — e "adresa" din baza de date unde stau deja datele tale reale
  let palete = {};
  let storageVersion = null;
  let openSet = new Set();

  // Rafturi — 5 liste fixe, separate de paleți, pentru note libere (cantități, coduri, etc.)
  const RAFT_STORAGE_KEY = 'rafturi';
  const RAFT_NAMES = ['Raft 1', 'Raft 2', 'Raft 3', 'Raft 4', 'Raft 5'];
  let rafturi = {};

  // Istoric — adăugări și ștergeri, cu dată/oră
  const ISTORIC_STORAGE_KEY = 'istoric';
  const ISTORIC_MAX_ENTRII = 300;
  let istoric = [];

  // Necesar — pop-up cu parfumurile cerute de angajați pentru împachetat
  const NECESAR_STORAGE_KEY = 'necesar';
  let necesar = [];

  const paletListEl = document.getElementById('paletList');
  const raftListEl = document.getElementById('raftList');
  const raftSearchEl = document.getElementById('raftSearch');
  const raftSearchResultsEl = document.getElementById('raftSearchResults');
  const istoricListEl = document.getElementById('istoricList');
  const clearIstoricBtn = document.getElementById('clearIstoricBtn');
  const openNecesarBtn = document.getElementById('openNecesarBtn');
  const closeNecesarBtn = document.getElementById('closeNecesarBtn');
  const necesarOverlay = document.getElementById('necesarOverlay');
  const necesarChipsEl = document.getElementById('necesarChips');
  const necesarInput = document.getElementById('necesarInput');
  const necesarAddBtn = document.getElementById('necesarAddBtn');
  const searchEl = document.getElementById('search');
  const searchResultsEl = document.getElementById('searchResults');
  const totalCountEl = document.getElementById('totalCount');
  const toastEl = document.getElementById('toast');
  const addPaletForm = document.getElementById('addPaletForm');
  const newPaletIdEl = document.getElementById('newPaletId');

  const loginForm = document.getElementById('loginForm');
  const loginEmailEl = document.getElementById('loginEmail');
  const loginPasswordEl = document.getElementById('loginPassword');
  const loginBtn = document.getElementById('loginBtn');
  const loggedInBar = document.getElementById('loggedInBar');
  const loggedInEmailEl = document.getElementById('loggedInEmail');
  const logoutBtn = document.getElementById('logoutBtn');

  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> toastEl.classList.remove('show'), 1800);
  }

  function naturalPaletSort(a, b){
    const na = parseInt((a.match(/\d+/) || ['0'])[0], 10);
    const nb = parseInt((b.match(/\d+/) || ['0'])[0], 10);
    if(na !== nb) return na - nb;
    return a.localeCompare(b);
  }

  async function loadKey(key){
    // Prioritate: dacă rulează în interiorul Claude (window.storage există),
    // folosește stocarea Claude — Firebase e blocat oricum din acel mediu.
    if(window.storage){
      try{
        const result = await window.storage.get(key, true);
        return (result && result.value) ? JSON.parse(result.value) : {};
      } catch(e){
        return {};
      }
    }
    // În afara Claude: folosește baza de date proprie, dacă e configurată.
    if(FIREBASE_URL){
      try{
        const res = await fetch(`${FIREBASE_URL}/${key}.json`);
        const data = await res.json();
        if(!res.ok || (data && data.error)){
          showToast('Baza de date a refuzat citirea — verifică regulile Firebase (permission denied)');
          return {};
        }
        return data || {};
      } catch(e){
        showToast('Nu m-am putut conecta la baza de date — verifică internetul');
        return {};
      }
    }
    return {};
  }

  async function saveKey(key, value){
    if(window.storage){
      try{
        await window.storage.set(key, JSON.stringify(value), true);
      } catch(e){
        showToast('Eroare la salvare — încearcă din nou');
      }
      return;
    }
    if(FIREBASE_URL){
      try{
        const authParam = authToken ? `?auth=${authToken}` : '';
        const res = await fetch(`${FIREBASE_URL}/${key}.json${authParam}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value)
        });
        if(!res.ok){
          const body = await res.text();
          showToast('Salvarea a fost refuzată de baza de date (permission denied) — verifică regulile Firebase');
          console.error('Firebase save refused:', res.status, body);
        }
      } catch(e){
        showToast('Eroare la salvare — verifică internetul');
      }
    }
  }

  async function loadData(){
    palete = await loadKey(STORAGE_KEY);
    render();
  }

  async function saveData(){
    await saveKey(STORAGE_KEY, palete);
  }

  async function loadRafturi(){
    const data = await loadKey(RAFT_STORAGE_KEY);
    rafturi = {};
    RAFT_NAMES.forEach(name => {
      rafturi[name] = normalizeNums(data[name]);
    });
    renderRafturi();
  }

  async function saveRafturi(){
    await saveKey(RAFT_STORAGE_KEY, rafturi);
  }

  async function loadIstoric(){
    const data = await loadKey(ISTORIC_STORAGE_KEY);
    istoric = Array.isArray(data) ? data : normalizeNums(data);
    renderIstoric();
  }

  async function saveIstoric(){
    await saveKey(ISTORIC_STORAGE_KEY, istoric);
  }

  function logIstoric(tip, text){
    istoric.unshift({ tip, text, data: new Date().toISOString() });
    if(istoric.length > ISTORIC_MAX_ENTRII){
      istoric = istoric.slice(0, ISTORIC_MAX_ENTRII);
    }
    renderIstoric();
    saveIstoric();
  }

  function formatDataIstoric(iso){
    try{
      const d = new Date(iso);
      return d.toLocaleString('ro-RO', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch(e){
      return iso;
    }
  }

  function renderIstoric(){
    if(istoric.length === 0){
      istoricListEl.innerHTML = `<div class="empty-chip-note">Niciun eveniment înregistrat încă.</div>`;
      return;
    }
    istoricListEl.innerHTML = istoric.map(ev => `
      <div class="istoric-entry tip-${escapeAttr(ev.tip)}">
        <span class="istoric-icon">${ev.tip === 'adaugare' ? '+' : '−'}</span>
        <span class="istoric-text">${escapeHtml(ev.text)}</span>
        <span class="istoric-data">${escapeHtml(formatDataIstoric(ev.data))}</span>
      </div>
    `).join('');
  }

  async function loadNecesar(){
    const data = await loadKey(NECESAR_STORAGE_KEY);
    necesar = Array.isArray(data) ? data : normalizeNums(data);
    renderNecesar();
  }

  async function saveNecesar(){
    await saveKey(NECESAR_STORAGE_KEY, necesar);
  }

  function renderNecesar(){
    necesarChipsEl.innerHTML = necesar.length
      ? necesar.map((val, idx) => `
          <span class="chip" data-necesar-idx="${idx}">
            ${escapeHtml(String(val))}
            <button type="button" class="remove-necesar-chip" aria-label="Scoate ${escapeHtml(String(val))} din necesar">×</button>
          </span>`).join('')
      : `<div class="empty-chip-note">Niciun parfum în necesar momentan.</div>`;

    necesarChipsEl.querySelectorAll('.remove-necesar-chip').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(!requireLogin()) return;
        const chip = btn.closest('.chip');
        const idx = parseInt(chip.getAttribute('data-necesar-idx'), 10);
        const removed = necesar[idx];
        necesar.splice(idx, 1);
        renderNecesar();
        await saveNecesar();
        logIstoric('stergere', `${removed} scos din necesar`);
      });
    });
  }

  function normalizeNums(raw){
    if(Array.isArray(raw)) return raw;
    if(raw && typeof raw === 'object') return Object.values(raw);
    return [];
  }

  // Marcaj de culoare (albastru) pe o bulă — codificat ca prefix invizibil în valoare
  const BLUE_MARKER = '\u2605';
  function isBlueMarked(v){ return String(v).startsWith(BLUE_MARKER); }
  function stripMarker(v){ return isBlueMarked(v) ? String(v).slice(BLUE_MARKER.length) : String(v); }
  function toggleMarker(v){ return isBlueMarked(v) ? stripMarker(v) : BLUE_MARKER + String(v); }

  function totalPerfumes(){
    return Object.values(palete).reduce((sum, arr) => sum + normalizeNums(arr).length, 0);
  }

  function render(){
    // total count
    const count = totalPerfumes();
    totalCountEl.textContent = count + (count === 1 ? ' flacon' : ' flacoane');

    // palet list
    const ids = Object.keys(palete).sort(naturalPaletSort);

    if(ids.length === 0){
      paletListEl.innerHTML = `
        <div class="empty-state">
          <div class="big">🗂️</div>
          Niciun palet încă.<br>Adaugă primul palet mai sus.
        </div>`;
    } else {
      paletListEl.innerHTML = ids.map(id => renderPaletCard(id)).join('');
    }

    attachPaletEvents();
    renderSearch();
  }

  function renderRafturi(){
    raftListEl.innerHTML = RAFT_NAMES.map(name => renderRaftCard(name)).join('');
    attachRaftEvents();
    renderRaftSearch();
  }

  function renderRaftSearch(){
    const q = raftSearchEl.value.trim().toLowerCase();
    if(!q){
      raftSearchResultsEl.innerHTML = '';
      return;
    }
    const matches = [];
    RAFT_NAMES.forEach(name => {
      normalizeNums(rafturi[name]).forEach((val) => {
        const curat = stripMarker(val).replace(/\s*○\s*$/, '').trim().toLowerCase();
        if(curat === q){
          matches.push({ name, value: stripMarker(val) });
        }
      });
    });

    if(matches.length === 0){
      raftSearchResultsEl.innerHTML = `<div class="no-results">Niciun parfum cu acest număr găsit pe rafturi.</div>`;
      return;
    }

    raftSearchResultsEl.innerHTML = matches.map(m => `
      <div class="result-card">
        <div>
          <span class="where">Parfum ${escapeHtml(String(m.value))} găsit pe</span>
          <span class="palet-name">${escapeHtml(m.name)}</span>
        </div>
      </div>
    `).join('');
  }

  function renderRaftCard(name){
    const entries = normalizeNums(rafturi[name]);
    const list = entries.length
      ? `<div class="chips">${entries.map((val, idx) => {
          const blue = isBlueMarked(val);
          const display = stripMarker(val);
          return `
          <span class="chip ${blue ? 'chip-blue' : ''}" data-raft="${escapeAttr(name)}" data-idx="${idx}">
            <span class="chip-value" data-toggle-color title="Apasă ca să schimbi culoarea">${escapeHtml(display)}</span>
            <button type="button" class="remove-raft-entry" aria-label="Șterge ${escapeHtml(display)} din ${escapeHtml(name)}">×</button>
          </span>`;
        }).join('')}</div>`
      : `<div class="empty-chip-note">Niciun element pe ${escapeHtml(name)} încă.</div>`;

    return `
      <div class="palet-card open" data-raft-card="${escapeAttr(name)}">
        <div class="palet-head" style="cursor:default;">
          <div class="palet-head-left">
            <h2>${escapeHtml(name)}</h2>
            <span class="sub">${entries.length} ${entries.length === 1 ? 'element' : 'elemente'}</span>
          </div>
        </div>
        <div class="palet-body" style="display:block;">
          ${list}
          <form class="add-num-form" data-raft-form="${escapeAttr(name)}" style="flex-wrap:wrap;">
            <input type="text" placeholder="Adaugă parfum" autocomplete="off" enterkeyhint="done">
            <div class="qty-stepper">
              <button type="button" class="qty-btn qty-minus" aria-label="Scade cantitatea">−</button>
              <input type="number" class="qty-input" value="1" min="1" inputmode="numeric">
              <button type="button" class="qty-btn qty-plus" aria-label="Crește cantitatea">+</button>
            </div>
            <button type="button" class="btn-primary add-raft-btn">Adaugă</button>
            <label style="display:flex;align-items:center;gap:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:var(--amber-800);width:100%;margin-top:4px;">
              <input type="checkbox" class="half-box-check" style="width:16px;height:16px;">
              ○ Jumătate cutie
            </label>
          </form>
        </div>
      </div>`;
  }

  function attachRaftEvents(){
    // toggle color (blue) on a chip
    raftListEl.querySelectorAll('.chip-value').forEach(span => {
      span.addEventListener('click', async (e) => {
        if(!requireLogin()) return;
        e.stopPropagation();
        const chip = span.closest('.chip');
        const name = chip.getAttribute('data-raft');
        const idx = parseInt(chip.getAttribute('data-idx'), 10);
        rafturi[name][idx] = toggleMarker(rafturi[name][idx]);
        renderRafturi();
        await saveRafturi();
      });
    });

    raftListEl.querySelectorAll('[data-raft-form]').forEach(form => {
      const name = form.getAttribute('data-raft-form');
      const input = form.querySelector('input[type="text"]');
      const halfBoxCheck = form.querySelector('.half-box-check');
      const qtyInput = form.querySelector('.qty-input');
      const qtyMinus = form.querySelector('.qty-minus');
      const qtyPlus = form.querySelector('.qty-plus');
      const btn = form.querySelector('.add-raft-btn');

      function currentQty(){
        const n = parseInt(qtyInput.value, 10);
        return (!n || n < 1) ? 1 : n;
      }

      qtyMinus.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        qtyInput.value = Math.max(1, currentQty() - 1);
      });
      qtyPlus.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        qtyInput.value = currentQty() + 1;
      });
      qtyInput.addEventListener('click', e => e.stopPropagation());

      async function doAdd(){
        if(!requireLogin()) return;
        let val = input.value.trim();
        if(!val) return;
        if(halfBoxCheck.checked) val = `${val} ○`;
        const qty = currentQty();
        for(let i = 0; i < qty; i++){
          rafturi[name].push(val);
        }
        renderRafturi();
        const freshForm = raftListEl.querySelector(`[data-raft-form="${cssEscape(name)}"]`);
        if(freshForm){
          const freshInput = freshForm.querySelector('input[type="text"]');
          freshInput.value = '';
          freshInput.focus();
        }
        await saveRafturi();
        const mesaj = qty > 1 ? `${val} adăugat (×${qty}) pe ${name}` : `${val} adăugat pe ${name}`;
        showToast(mesaj);
        logIstoric('adaugare', mesaj);
      }

      btn.addEventListener('click', (e) => { e.preventDefault(); doAdd(); });
      input.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){ e.preventDefault(); doAdd(); }
      });
    });

    raftListEl.querySelectorAll('.remove-raft-entry').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if(!requireLogin()) return;
        e.stopPropagation();
        const chip = btn.closest('.chip');
        const name = chip.getAttribute('data-raft');
        const idx = parseInt(chip.getAttribute('data-idx'), 10);
        const removed = rafturi[name][idx];
        rafturi[name].splice(idx, 1);
        renderRafturi();
        await saveRafturi();
        showToast(`${removed} scos de pe ${name}`);
        logIstoric('stergere', `${removed} scos de pe ${name}`);
      });
    });
  }

  function renderPaletCard(id){
    const nums = normalizeNums(palete[id]);
    palete[id] = nums; // heal any non-array shape (e.g. Firebase turning sparse arrays into objects)
    const isOpen = openSet.has(id);
    const chips = nums.length
      ? `<div class="chips">${nums.map((n, idx) => {
          const blue = isBlueMarked(n);
          const display = stripMarker(n);
          return `
          <span class="chip ${blue ? 'chip-blue' : ''}" data-palet="${escapeAttr(id)}" data-idx="${idx}">
            <span class="chip-value" data-toggle-color title="Apasă ca să schimbi culoarea">${escapeHtml(display)}</span>
            <button type="button" class="remove-chip" aria-label="Scoate ${escapeHtml(display)} din ${escapeHtml(id)}">×</button>
          </span>`;
        }).join('')}</div>`
      : `<div class="empty-chip-note">Niciun parfum pe acest palet.</div>`;

    return `
      <div class="palet-card ${isOpen ? 'open' : ''}" data-palet="${escapeAttr(id)}">
        <div class="palet-head" data-toggle="${escapeAttr(id)}">
          <div class="palet-head-left">
            <h2 data-name="${escapeAttr(id)}">${escapeHtml(id)}</h2>
            <button type="button" class="edit-name-btn" data-edit-palet="${escapeAttr(id)}" aria-label="Redenumește ${escapeHtml(id)}" title="Redenumește">✎</button>
            <span class="sub">${nums.length} ${nums.length === 1 ? 'parfum' : 'parfumuri'}</span>
          </div>
          <span class="chevron">▶</span>
        </div>
        <div class="palet-body">
          ${chips}
          <form class="add-num-form" data-palet-form="${escapeAttr(id)}">
            <input type="text" inputmode="numeric" placeholder="Nr. parfum nou" autocomplete="off" enterkeyhint="done">
            <div class="qty-stepper">
              <button type="button" class="qty-btn qty-minus" aria-label="Scade cantitatea">−</button>
              <input type="number" class="qty-input" value="1" min="1" inputmode="numeric">
              <button type="button" class="qty-btn qty-plus" aria-label="Crește cantitatea">+</button>
            </div>
            <button type="button" class="btn-primary add-num-btn">Adaugă</button>
          </form>
          <div class="palet-footer">
            <button type="button" class="btn-ghost" data-delete-palet="${escapeAttr(id)}">Șterge paletul</button>
          </div>
        </div>
      </div>`;
  }

  function attachPaletEvents(){
    // toggle open/close
    paletListEl.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-toggle');
        if(openSet.has(id)) openSet.delete(id);
        else openSet.add(id);
        render();
      });
    });

    // toggle color (blue) on a chip
    paletListEl.querySelectorAll('.chip-value').forEach(span => {
      span.addEventListener('click', async (e) => {
        if(!requireLogin()) return;
        e.stopPropagation();
        const chip = span.closest('.chip');
        const id = chip.getAttribute('data-palet');
        const idx = parseInt(chip.getAttribute('data-idx'), 10);
        palete[id][idx] = toggleMarker(palete[id][idx]);
        render();
        await saveData();
      });
    });

    // remove a chip
    paletListEl.querySelectorAll('.remove-chip').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if(!requireLogin()) return;
        e.stopPropagation();
        const chip = btn.closest('.chip');
        const id = chip.getAttribute('data-palet');
        const idx = parseInt(chip.getAttribute('data-idx'), 10);
        const removed = palete[id][idx];
        palete[id].splice(idx, 1);
        render();
        await saveData();
        showToast(`${removed} scos de pe ${id}`);
        logIstoric('stergere', `${removed} scos de pe ${id}`);
      });
    });

    // add number to palet
    paletListEl.querySelectorAll('[data-palet-form]').forEach(form => {
      const id = form.getAttribute('data-palet-form');
      const input = form.querySelector('input[type="text"]');
      const qtyInput = form.querySelector('.qty-input');
      const qtyMinus = form.querySelector('.qty-minus');
      const qtyPlus = form.querySelector('.qty-plus');
      const btn = form.querySelector('.add-num-btn');

      function currentQty(){
        const n = parseInt(qtyInput.value, 10);
        return (!n || n < 1) ? 1 : n;
      }

      qtyMinus.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        qtyInput.value = Math.max(1, currentQty() - 1);
      });
      qtyPlus.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        qtyInput.value = currentQty() + 1;
      });
      qtyInput.addEventListener('click', e => e.stopPropagation());

      async function doAdd(){
        if(!requireLogin()) return;
        const val = input.value.trim();
        if(!val) return;
        const qty = currentQty();
        for(let i = 0; i < qty; i++){
          palete[id].push(val);
        }
        openSet.add(id);
        render();
        refocusPaletInput(id);
        await saveData();
        const mesaj = qty > 1 ? `${val} adăugat (×${qty}) pe ${id}` : `${val} adăugat pe ${id}`;
        showToast(mesaj);
        logIstoric('adaugare', mesaj);
      }

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        doAdd();
      });
      input.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){
          e.preventDefault();
          doAdd();
        }
      });
      form.addEventListener('click', e => e.stopPropagation());
    });

    // rename palet
    paletListEl.querySelectorAll('[data-edit-palet]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-edit-palet');
        const headLeft = btn.closest('.palet-head-left');
        headLeft.innerHTML = `
          <form class="rename-form" data-rename-form="${escapeAttr(id)}">
            <input type="text" value="${escapeAttr(id)}" autocomplete="off">
            <button type="button" class="btn-primary save-rename">Salvează</button>
            <button type="button" class="btn-ghost cancel-rename">Anulează</button>
          </form>`;
        const input = headLeft.querySelector('input');
        input.focus();
        input.select();

        function doRename(){
          if(!requireLogin()){ render(); return; }
          let newId = input.value.trim();
          if(!newId || newId === id){ render(); return; }
          if(!isNaN(newId)) newId = 'P' + newId;
          if(palete[newId]){
            showToast(`${newId} există deja`);
            return;
          }
          palete[newId] = palete[id];
          delete palete[id];
          if(openSet.has(id)){ openSet.delete(id); openSet.add(newId); }
          render();
          saveData();
          showToast(`${id} redenumit în ${newId}`);
        }

        headLeft.querySelector('.save-rename').addEventListener('click', (e) => {
          e.stopPropagation();
          doRename();
        });
        headLeft.querySelector('.cancel-rename').addEventListener('click', (e) => {
          e.stopPropagation();
          render();
        });
        input.addEventListener('keydown', (e) => {
          if(e.key === 'Enter'){ e.preventDefault(); doRename(); }
          if(e.key === 'Escape'){ e.preventDefault(); render(); }
        });
        input.addEventListener('click', e => e.stopPropagation());
      });
    });

    // delete palet
    paletListEl.querySelectorAll('[data-delete-palet]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if(!requireLogin()) return;
        e.stopPropagation();
        const id = btn.getAttribute('data-delete-palet');
        if(btn.dataset.confirming === 'true'){
          delete palete[id];
          openSet.delete(id);
          render();
          saveData();
          showToast(`${id} șters`);
          logIstoric('stergere', `Palet ${id} șters`);
        } else {
          btn.dataset.confirming = 'true';
          btn.textContent = 'Sigur? Apasă din nou';
          setTimeout(() => {
            btn.dataset.confirming = 'false';
            btn.textContent = 'Șterge paletul';
          }, 3000);
        }
      });
    });
  }

  function renderSearch(){
    const q = searchEl.value.trim().toLowerCase();
    if(!q){
      searchResultsEl.innerHTML = '';
      return;
    }
    const matches = [];
    Object.keys(palete).sort(naturalPaletSort).forEach(id => {
      palete[id].forEach((n, idx) => {
        const curat = stripMarker(n).replace(/\s*○\s*$/, '').trim().toLowerCase();
        if(curat === q){
          matches.push({ id, value: stripMarker(n), idx });
        }
      });
    });

    if(matches.length === 0){
      searchResultsEl.innerHTML = `<div class="no-results">Niciun parfum cu acest număr găsit.</div>`;
      return;
    }

    searchResultsEl.innerHTML = matches.map(m => `
      <div class="result-card">
        <div>
          <span class="where">Parfum ${escapeHtml(String(m.value))} găsit pe</span>
          <span class="palet-name">${escapeHtml(m.id)}</span>
        </div>
        <button type="button" class="btn-ghost" data-jump="${escapeAttr(m.id)}">Deschide ▸</button>
      </div>
    `).join('');

    searchResultsEl.querySelectorAll('[data-jump]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-jump');
        openSet.add(id);
        searchEl.value = '';
        render();
        setTimeout(() => {
          const card = paletListEl.querySelector(`.palet-card[data-palet="${cssEscape(id)}"]`);
          if(card) card.scrollIntoView({ behavior:'smooth', block:'center' });
        }, 50);
      });
    });
  }

  function refocusPaletInput(id){
    const form = paletListEl.querySelector(`[data-palet-form="${cssEscape(id)}"]`);
    if(form){
      const input = form.querySelector('input[type="text"]');
      if(input){
        input.value = '';
        input.focus();
      }
    }
  }

  function cssEscape(s){
    return String(s).replace(/["\\]/g, '\\$&');
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s){ return escapeHtml(s); }

  async function addPalet(){
    if(!requireLogin()) return;
    let id = newPaletIdEl.value.trim();
    if(!id) return;
    if(!isNaN(id)) id = 'P' + id;
    if(palete[id]){
      showToast(`${id} există deja`);
      return;
    }
    palete[id] = [];
    openSet.add(id);
    newPaletIdEl.value = '';
    render();
    await saveData();
    showToast(`${id} adăugat`);
    logIstoric('adaugare', `Palet ${id} creat`);
  }

  const addPaletBtn = document.getElementById('addPaletBtn');
  addPaletBtn.addEventListener('click', (e) => {
    e.preventDefault();
    addPalet();
  });

  // Fallback: some mobile keyboards don't fire "submit" on the Enter/OK key
  // inside this embedded view, so force it manually.
  newPaletIdEl.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
      e.preventDefault();
      addPalet();
    }
  });

  window.addEventListener('error', (e) => {
    showToast('A apărut o eroare — încearcă din nou');
  });

  const importBtn = document.getElementById('importBtn');
  const importTextEl = document.getElementById('importText');
  const exportBtn = document.getElementById('exportBtn');

  exportBtn.addEventListener('click', async () => {
    const ids = Object.keys(palete).sort(naturalPaletSort);
    if(ids.length === 0){
      showToast('Nu există niciun palet de exportat');
      return;
    }
    const lines = ids.map(id => `${id}. ${normalizeNums(palete[id]).map(stripMarker).join(' ')}`);
    const text = lines.join('\n');
    importTextEl.value = text;
    importTextEl.focus();
    importTextEl.select();
    try{
      await navigator.clipboard.writeText(text);
      showToast('Lista a fost copiată în clipboard');
    } catch(e){
      showToast('Lista e afișată mai jos — selecteaz-o și copiaz-o manual (Ctrl+C)');
    }
  });

  async function performImport(text){
    if(!requireLogin()) return;
    if(!text.trim()){
      showToast('Nu am găsit text de importat');
      return;
    }

    let paletCount = 0;
    let numCount = 0;

    // 1) Încearcă mai întâi JSON — format fără ambiguitate: {"P1":[38,47,...], "P2":[...]}
    let parsedAsJson = false;
    try{
      const data = JSON.parse(text);
      if(data && typeof data === 'object' && !Array.isArray(data)){
        parsedAsJson = true;
        Object.keys(data).forEach(rawId => {
          let id = String(rawId).trim();
          if(!isNaN(id)) id = 'P' + id;
          const rawNums = data[rawId];
          const nums = Array.isArray(rawNums)
            ? rawNums.map(n => String(n).trim()).filter(n => n.length)
            : String(rawNums).match(/\d+/g) || [];
          palete[id] = nums;
          paletCount++;
          numCount += nums.length;
        });
      }
    } catch(e){
      // nu e JSON valid — continuă cu formatul text simplu
    }

    // 2) Dacă nu era JSON, folosește formatul text: "P1. 38 47 47 8 ..."
    if(!parsedAsJson){
      const lines = text.split('\n');
      lines.forEach(line => {
        const m = line.match(/^\s*P\s*(\d+)\s*[:.]?\s*(.*)$/i);
        if(!m) return;
        const id = 'P' + m[1];
        const nums = (m[2].match(/\d+/g) || []);
        if(nums.length === 0 && !palete[id]) return;
        palete[id] = nums;
        paletCount++;
        numCount += nums.length;
      });
    }

    if(paletCount === 0){
      showToast('Nu am recunoscut niciun palet — verifică formatul (text sau JSON)');
      return;
    }
    importTextEl.value = '';
    render();
    await saveData();
    showToast(`${paletCount} paleți importați (${parsedAsJson ? 'JSON' : 'text'}), ${numCount} parfumuri`);
  }

  importBtn.addEventListener('click', () => performImport(importTextEl.value));

  const importFileBtn = document.getElementById('importFileBtn');
  const importFileInput = document.getElementById('importFileInput');
  importFileBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', () => {
    const file = importFileInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => performImport(String(reader.result));
    reader.onerror = () => showToast('Nu am putut citi fișierul');
    reader.readAsText(file);
    importFileInput.value = '';
  });

  searchEl.addEventListener('input', renderSearch);
  raftSearchEl.addEventListener('input', renderRaftSearch);

  // Tab-uri: Paleți / Rafturi / Istoric
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
    });
  });

  clearIstoricBtn.addEventListener('click', () => {
    if(!requireLogin()) return;
    if(clearIstoricBtn.dataset.confirming === 'true'){
      istoric = [];
      renderIstoric();
      saveIstoric();
      clearIstoricBtn.dataset.confirming = 'false';
      clearIstoricBtn.textContent = 'Golește istoricul';
    } else {
      clearIstoricBtn.dataset.confirming = 'true';
      clearIstoricBtn.textContent = 'Sigur? Apasă din nou';
      setTimeout(() => {
        clearIstoricBtn.dataset.confirming = 'false';
        clearIstoricBtn.textContent = 'Golește istoricul';
      }, 3000);
    }
  });

  // Pop-up Necesar
  openNecesarBtn.addEventListener('click', () => {
    necesarOverlay.classList.add('open');
    necesarInput.focus();
  });
  closeNecesarBtn.addEventListener('click', () => {
    necesarOverlay.classList.remove('open');
  });
  necesarOverlay.addEventListener('click', (e) => {
    if(e.target === necesarOverlay) necesarOverlay.classList.remove('open');
  });

  async function addNecesar(){
    if(!requireLogin()) return;
    const val = necesarInput.value.trim();
    if(!val) return;
    necesar.push(val);
    necesarInput.value = '';
    necesarInput.focus();
    renderNecesar();
    await saveNecesar();
    logIstoric('adaugare', `${val} adăugat în necesar`);
  }
  necesarAddBtn.addEventListener('click', (e) => { e.preventDefault(); addNecesar(); });
  necesarInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); addNecesar(); }
  });

  // ===== Autentificare =====
  function updateAuthUI(){
    if(authToken){
      loginForm.style.display = 'none';
      loggedInBar.style.display = 'flex';
      loggedInEmailEl.textContent = `Logat ca: ${userEmail}`;
    } else {
      loginForm.style.display = 'flex';
      loggedInBar.style.display = 'none';
    }
    document.body.classList.toggle('logged-in', !!authToken);
  }

  async function signIn(){
    const email = loginEmailEl.value.trim();
    const password = loginPasswordEl.value;
    if(!email || !password){
      showToast('Completează email și parolă');
      return;
    }
    try{
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });
      const data = await res.json();
      if(!res.ok){
        showToast('Login eșuat — verifică email/parola');
        return;
      }
      authToken = data.idToken;
      userEmail = data.email;
      loginPasswordEl.value = '';
      updateAuthUI();
      showToast('Autentificat cu succes');
    } catch(e){
      showToast('Eroare de conexiune la login');
    }
  }

  function signOut(){
    authToken = null;
    userEmail = null;
    updateAuthUI();
    showToast('Delogat');
  }

  function requireLogin(){
    if(!authToken){
      showToast('Trebuie să fii logat ca să faci asta');
      return false;
    }
    return true;
  }

  loginBtn.addEventListener('click', signIn);
  loginPasswordEl.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); signIn(); }
  });
  logoutBtn.addEventListener('click', signOut);
  updateAuthUI();

  loadData();
  loadRafturi();
  loadIstoric();
  loadNecesar();
})();