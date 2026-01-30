/* --- app.js (v30.9) --- */

let dataNav = new Date();
const hoje = new Date();
let diaSel = hoje.getDate();
let settings = { limit: 4000, dailyGoal: 30 };
let dbGlobal = { wishes: [], fixed: [], catExp: [], catInc: [] };
let dbMensal = {};
let myChart = null;
let selectedWishIndex = null;
let chartType = 'bar';
let currentReportFilter = 'all';
let pieFilter = 'all';
let privacyMode = false;
let isDark = false;
let isSandbox = false;

// Flags de Edição
let editMode = false;
let editItemIndex = null;
let editItemType = null;

const defaultExp = [{n: 'Casa', i: '🏠'}, {n: 'Alim.', i: '🍔'}, {n: 'Transp.', i: '🚗'}, {n: 'Pessoal', i: '👤'}, {n: 'Lazer', i: '🎉'}];
const defaultInc = [{n: 'Salário', i: '💰'}, {n: 'Vendas', i: '🏷️'}];

window.onload = () => {
    const s = localStorage.getItem('appV25_settings');
    if (s) settings = JSON.parse(s);
    try {
        const g = localStorage.getItem('appV25_g');
        if (g) {
            dbGlobal = JSON.parse(g);
            if (!dbGlobal.fixed) dbGlobal.fixed = [];
            if (!dbGlobal.catExp) dbGlobal.catExp = [...defaultExp];
            if (!dbGlobal.catInc) dbGlobal.catInc = [...defaultInc];
        } else {
            dbGlobal.catExp = [...defaultExp];
            dbGlobal.catInc = [...defaultInc];
        }
    } catch (e) {
        dbGlobal = { wishes: [], fixed: [], catExp: [...defaultExp], catInc: [...defaultInc] };
    }

    if (localStorage.getItem('appV25_privacy') === 'true') togglePrivacy();
    if (localStorage.getItem('appV25_theme') === 'dark') toggleTheme();

    // Notificações
    if ("Notification" in window && Notification.permission === "granted") {
        const btn = document.getElementById('btnNotif');
        if(btn) btn.classList.add('active');
    }
    setInterval(checkNotificationTime, 60000);

    const y = dataNav.getFullYear();
    const m = String(dataNav.getMonth() + 1).padStart(2, '0');
    document.getElementById('modalStartMonth').value = `${y}-${m}`;

    populateSelects();
    render();
    checkFixedExpenses();
    checkShortcuts();
};

/* --- RENDERIZAÇÃO DA LISTA COM SWIPE --- */
function renderList(id, arr, type, extra) {
    const ul = document.getElementById(id);
    ul.innerHTML = "";
    
    if (extra) {
        const cls = extra.type === 'debt' ? 'item-special-debt' : 'item-special';
        ul.innerHTML += `<li class="item-wrapper"><div class="item-content" style="border-left: 4px solid var(--text-muted)">
            <div class="item-left"><span>📌</span><div class="item-info"><span class="item-name">${extra.n}</span></div></div>
            <strong class="blur-target">${fmt(extra.v)}</strong>
        </div></li>`;
    }

    if (!arr || arr.length === 0 && !extra) { 
        ul.innerHTML += "<div class='empty-msg' style='text-align:center; padding:10px; opacity:0.5'>Nenhum lançamento.</div>"; 
        return; 
    }

    const mapped = arr.map((item, index) => ({ ...item, originalIndex: index }));
    mapped.sort((a, b) => (a.d || 0) - (b.d || 0));

    mapped.forEach((it) => {
        const ic = it.c ? it.c.split(' ')[0] : '💸';
        const dayStr = String(it.d || 1).padStart(2, '0');
        const obsHtml = it.o ? `<span class="item-obs">${it.o}</span>` : '';
        
        const li = document.createElement('li');
        li.className = 'item-wrapper';
        
        li.innerHTML = `
            <div class="swipe-actions">
                <div class="swipe-action-left">✏️ Editar</div>
                <div class="swipe-action-right">🗑️ Excluir</div>
            </div>
            <div class="item-content">
                <div class="item-left">
                    <span class="day-badge">${dayStr}</span>
                    <span class="cat-icon">${ic}</span>
                    <div class="item-info">
                        <span class="item-name">${it.n}</span>
                        ${obsHtml}
                    </div>
                </div>
                <div class="item-value-group">
                    <strong class="blur-target">${fmt(it.v)}</strong>
                </div>
            </div>
        `;

        // SWIPE LOGIC
        const content = li.querySelector('.item-content');
        let startX, currentX, isDragging = false;

        content.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            content.classList.add('is-swiping');
        }, {passive: true});

        content.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            const diff = currentX - startX;
            if (diff > 0 && diff < 100) content.style.transform = `translateX(${diff}px)`; // Direita
            else if (diff < 0 && diff > -100) content.style.transform = `translateX(${diff}px)`; // Esquerda
        }, {passive: true});

        content.addEventListener('touchend', () => {
            isDragging = false;
            content.classList.remove('is-swiping');
            const diff = currentX - startX;

            if (diff > 80) { // Swipe Right -> Edit
                content.style.transform = `translateX(0px)`;
                openEdit(type, it.originalIndex);
            } else if (diff < -80) { // Swipe Left -> Delete
                content.style.transform = `translateX(-100%)`;
                setTimeout(() => del(type, it.originalIndex), 200);
            } else {
                content.style.transform = `translateX(0px)`;
            }
        });

        ul.appendChild(li);
    });
}

/* --- FUNÇÕES DE EDIÇÃO --- */
function openEdit(type, index) {
    const db = getDB(dataNav.getFullYear(), dataNav.getMonth());
    let item;
    
    if (type === 'in') item = db.in[index];
    else if (type === 'debit') item = db.debit[index];
    else if (type === 'credit') item = db.credit[index];

    if (!item) return;

    editMode = true;
    editItemIndex = index;
    editItemType = type;

    document.getElementById('quickType').value = type;
    document.getElementById('quickDate').value = item.d || 1;
    document.getElementById('quickDesc').value = item.n;
    document.getElementById('quickVal').value = item.v;
    
    let cats = (type === 'in') ? dbGlobal.catInc : dbGlobal.catExp;
    const catSel = document.getElementById('quickCat');
    catSel.innerHTML = cats.map(c => `<option value="${c.i} ${c.n}">${c.i} ${c.n}</option>`).join('');
    catSel.value = item.c;

    document.getElementById('quickTitle').innerText = "Editar Lançamento ✏️";
    document.querySelector('#quickAddModal .btn-confirm').innerText = "Salvar Alteração";
    
    toggleFab(); 
    document.getElementById('quickAddModal').style.display = 'flex';
}

function saveQuickAdd() {
    const type = document.getElementById('quickType').value;
    let dVal = parseInt(document.getElementById('quickDate').value) || 1;
    const cat = document.getElementById('quickCat').value;
    const desc = document.getElementById('quickDesc').value;
    const val = parseFloat(document.getElementById('quickVal').value);

    if(!desc || isNaN(val) || val <= 0) { alert("Preencha corretamente."); return; }

    let targetY = dataNav.getFullYear();
    let targetM = dataNav.getMonth();
    const db = getDB(targetY, targetM);
    
    let targetArr;
    if(type === 'in') targetArr = db.in;
    else if(type === 'debit') targetArr = db.debit;
    else targetArr = db.credit;

    const newItem = { n: desc, v: val, d: dVal, c: cat, o: '' };

    if (editMode) {
        // Atualiza item existente
        targetArr[editItemIndex] = newItem;
        editMode = false;
        editItemIndex = null;
    } else {
        // Novo item (aplica regra do dia 1)
        if (type === 'credit') {
            const closingDay = getBusinessClosingDate(targetY, targetM);
            if (dVal >= closingDay) { 
                alert(`📅 Compra após fechamento (${closingDay}). Lançado para o 1º dia do mês seguinte!`);
                targetM++;
                if (targetM > 11) { targetM = 0; targetY++; }
                dVal = 1; 
                // Se mudou de mês, precisamos pegar o DB correto
                const dbNext = getDB(targetY, targetM);
                dbNext.credit.push({ n: desc, v: val, d: dVal, c: cat, o: '' });
                localStorage.setItem(getKey(targetY, targetM), JSON.stringify(dbNext));
                
                // Se estamos vendo o mês atual, apenas recarrega para atualizar totais globais
                if (dataNav.getFullYear() === targetY && dataNav.getMonth() === targetM) {
                    save(); // Salva e renderiza
                } else {
                    render(); // Renderiza (totais globais)
                }
                closeQuickAdd();
                return;
            }
        }
        targetArr.push(newItem);
    }

    save();
    closeQuickAdd();
}

function closeQuickAdd() { 
    document.getElementById('quickAddModal').style.display = 'none';
    setTimeout(() => {
        document.getElementById('quickTitle').innerText = "Novo Lançamento";
        document.querySelector('#quickAddModal .btn-confirm').innerText = "Salvar";
        document.getElementById('quickDesc').value = "";
        document.getElementById('quickVal').value = "";
        editMode = false;
    }, 200);
}

// --- NOTIFICATIONS ---
function toggleNotifications() {
    if (!("Notification" in window)) { alert("Navegador sem suporte."); return; }
    if (Notification.permission === "granted") { alert("Notificações ativas!"); return; }
    Notification.requestPermission().then(p => { if(p==="granted") document.getElementById('btnNotif').classList.add('active'); });
}
function checkNotificationTime() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const h = new Date().getHours();
    if (h === 20) {
        const t = new Date().toDateString();
        if (localStorage.getItem('appV30_last_notif_date') !== t) {
            new Notification("Fechamento! 💸", { body: "Lance seus gastos do dia." });
            localStorage.setItem('appV30_last_notif_date', t);
        }
    }
}

// --- UTILS & DB ---
function getKey(a, m) { return `appV25_m_${a}_${m}`; }
function getDB(a, m) {
    const k = getKey(a, m);
    if (!dbMensal[k]) {
        const s = localStorage.getItem(k);
        dbMensal[k] = s ? JSON.parse(s) : { in: [], debit: [], credit: [], invoicePaid: 0 };
    }
    return dbMensal[k];
}
function save() {
    const k = getKey(dataNav.getFullYear(), dataNav.getMonth());
    if (!isSandbox) localStorage.setItem(k, JSON.stringify(getDB(dataNav.getFullYear(), dataNav.getMonth())));
    render();
}
function getBusinessClosingDate(y, m) {
    let d = new Date(y, m + 1, 0); 
    let w = d.getDay(); 
    if(w === 6) d.setDate(d.getDate() - 1); 
    if(w === 0) d.setDate(d.getDate() - 2);
    return d.getDate();
}

// --- CORE UI ---
function toggleFab() {
    document.getElementById('fabMenu').classList.toggle('open');
    document.querySelector('.fab-main').classList.toggle('active');
}
function openQuickAdd(type) {
    if(editMode) return; 
    toggleFab(); 
    const modal = document.getElementById('quickAddModal');
    document.getElementById('quickType').value = type;
    document.getElementById('quickDate').value = diaSel || new Date().getDate();
    let cats = (type === 'in') ? dbGlobal.catInc : dbGlobal.catExp;
    document.getElementById('quickCat').innerHTML = cats.map(c => `<option value="${c.i} ${c.n}">${c.i} ${c.n}</option>`).join('');
    modal.style.display = 'flex';
}

function generateAdvice(totalVal) {
    const metaDiaria = settings.dailyGoal || 30;
    const dbAtual = getDB(dataNav.getFullYear(), dataNav.getMonth());
    let rendaBase = (dbAtual.in || []).reduce((a, b) => a + b.v, 0);
    if (rendaBase === 0) rendaBase = settings.limit; 
    const custoFixo = dbGlobal.fixed.reduce((a, b) => a + b.v, 0);

    let html = `<div class='sug-list' style='max-height:250px; overflow-y:auto; font-size:0.8rem'>`;
    html += `<div style='padding:8px; background:var(--bg); border-radius:6px; margin-bottom:8px; border:1px solid var(--border)'>🎯 Regra: Sobra > <strong>${fmt(metaDiaria)}/dia</strong></div>`;

    for (let p = 1; p <= 12; p++) {
        let parcVal = totalVal / p;
        let melhorMes = null;
        let sobraDiariaSimulada = 0;

        for (let offset = 0; offset < 12; offset++) {
            let targetDate = new Date(dataNav.getFullYear(), dataNav.getMonth() + offset, 1);
            let tY = targetDate.getFullYear();
            let tM = targetDate.getMonth();
            let dadosFuturos = getFutureData(tY, tM);
            let cartaoComprometido = (dadosFuturos.credit || []).reduce((a,b)=>a+b.v, 0);
            let saldoLivre = rendaBase - custoFixo - cartaoComprometido - parcVal;
            let diarioPrevisto = saldoLivre / 30;

            if (diarioPrevisto >= metaDiaria) {
                melhorMes = targetDate;
                sobraDiariaSimulada = diarioPrevisto;
                break; 
            }
        }

        let rowColor = melhorMes ? "var(--text)" : "var(--text-muted)";
        let statusColor = melhorMes ? "var(--green)" : "var(--red)";
        let statusIcon = melhorMes ? "🗓️" : "🚫";
        let statusText = melhorMes ? `${statusIcon} ${melhorMes.toLocaleString('pt-BR', {month:'short'}).toUpperCase()}/${melhorMes.getFullYear().toString().substr(2)}` : "Inviável";
        let extraInfo = melhorMes ? `(Sobra: ${fmt(sobraDiariaSimulada)}/dia)` : `(< ${fmt(metaDiaria)})`;

        html += `<div class="sug-item" style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px dashed var(--border); align-items:center; color:${rowColor}">
            <div style="display:flex; flex-direction:column;"><span style="font-weight:bold;">${p}x de ${fmt(parcVal)}</span><span style="font-size:0.75rem; opacity:0.7">${extraInfo}</span></div>
            <div style="text-align:right; font-size:0.75rem; color:${statusColor}; font-weight:bold; max-width:40%">${statusText}</div>
        </div>`;
    }
    html += "</div>";
    return `<details style='margin-top:10px; background:var(--input-bg); padding:10px; border-radius:10px; border:1px solid var(--border)' open><summary style='cursor:pointer; font-weight:bold; color:var(--primary); list-style:none; display:flex; justify-content:space-between'><span>💡 Simulação Inteligente (12x)</span><span>▼</span></summary>${html}</details>`;
}

function getFutureData(y, m) {
    const k = getKey(y, m);
    const s = localStorage.getItem(k);
    if (s) return JSON.parse(s);
    return { credit: [], debit: [], in: [], invoicePaid: 0 };
}

function toggleSandbox() {
    if (!isSandbox) {
        if (!confirm("Entrar no Modo Simulação? Nada será salvo.")) return;
        isSandbox = true;
        document.body.classList.add('sandbox-active');
        document.getElementById('btnSandbox').innerText = '🚪';
        alert("🧪 SIMULAÇÃO ATIVA");
    } else {
        if (!confirm("Sair do simulador?")) return;
        isSandbox = false;
        document.body.classList.remove('sandbox-active');
        document.getElementById('btnSandbox').innerText = '🧪';
        dbMensal = {};
        render();
    }
}

function togglePrivacy() {
    privacyMode = !privacyMode;
    if (privacyMode) document.body.classList.add('privacy-on');
    else document.body.classList.remove('privacy-on');
    document.getElementById('btnPrivacy').innerText = privacyMode ? '🙈' : '👁️';
    localStorage.setItem('appV25_privacy', privacyMode);
}
function toggleTheme() {
    isDark = !isDark;
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('appV25_theme', isDark ? 'dark' : 'light');
}

function setChartType(t) {
    chartType = t;
    document.querySelectorAll('.chart-toggle').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('pieFilterOpts').style.display = t === 'pie' ? 'flex' : 'none';
    renderChart(dataNav.getFullYear(), dataNav.getMonth());
}
function setPieFilter(f) {
    pieFilter = f;
    document.querySelectorAll('.pie-filter-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderChart(dataNav.getFullYear(), dataNav.getMonth());
}
function renderChart(cA, cM) {
    const ctx = document.getElementById('balanceChart');
    if (myChart) myChart.destroy();
    const textColor = isDark ? '#f8fafc' : '#334155';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    if (chartType === 'bar') {
        let labels = [], dataS = [], dataF = [];
        for (let i = 0; i < 6; i++) {
            let d = new Date(cA,cM + i,1);
            let lA = d.getFullYear(), lM = d.getMonth();
            let rep = calcularRepasses(lA, lM);
            let k = getKey(lA, lM);
            let db = localStorage.getItem(k) ? JSON.parse(localStorage.getItem(k)) : {in:[], debit:[], credit:[]};
            if (isSandbox && lA === dataNav.getFullYear() && lM === dataNav.getMonth()) db = getDB(lA, lM);
            let mIn = (db.in || []).reduce((a,b)=>a+b.v,0) + rep.sobra;
            let mDeb = (db.debit || []).reduce((a,b)=>a+b.v,0);
            let mFat = (db.credit || []).reduce((a,b)=>a+b.v,0) + rep.divida;
            labels.push(d.toLocaleString('pt-BR', {month:'short'}));
            dataS.push(mIn - mDeb - mFat);
            dataF.push(mFat);
        }
        myChart = new Chart(ctx,{
            type: 'bar',
            data: {
                labels,
                datasets: [{label:'Saldo', data:dataS, backgroundColor:dataS.map(v=>v<0?'#ef4444':'#10b981'), borderRadius:4, order:2},
                            {label:'Fatura', data:dataF, type:'line', borderColor:textColor, borderWidth:2, pointRadius:3, order:1}]
            },
            options: {responsive:true, maintainAspectRatio:false, scales:{y:{ticks:{color:textColor},grid:{color:gridColor}},x:{ticks:{color:textColor},grid:{display:false}}}, plugins:{legend:{labels:{color:textColor}}}}
        });
    } else if (chartType === 'line') {
        const d = getDB(cA, cM);
        const rep = calcularRepasses(cA, cM);
        const lastDay = new Date(cA,cM + 1,0).getDate();
        let labels = [], data = [], currentBal = rep.sobra;
        const transactions = new Array(lastDay + 1).fill(0);
        (d.in || []).forEach(i => transactions[i.d || 1] += i.v);
        (d.debit || []).forEach(i => transactions[i.d || 1] -= i.v);
        (d.credit || []).forEach(i => transactions[i.d || 1] -= i.v);
        for (let i = 1; i <= lastDay; i++) {
            currentBal += transactions[i];
            labels.push(i);
            data.push(currentBal);
        }
        myChart = new Chart(ctx,{
            type: 'line',
            data: {
                labels,
                datasets: [{label:'Saldo', data, borderColor:'#3b82f6', backgroundColor:'rgba(59, 130, 246, 0.1)', fill:true, tension:0.3}]
            },
            options: {responsive:true, maintainAspectRatio:false, scales:{y:{ticks:{color:textColor},grid:{color:gridColor}},x:{ticks:{color:textColor},grid:{display:false}}}, plugins:{legend:{labels:{color:textColor}}}}
        });
    } else {
        const db = getDB(cA, cM);
        const cats = {};
        if (pieFilter === 'all' || pieFilter === 'debit') (db.debit || []).forEach(i => { const c = i.c || 'Outros'; cats[c] = (cats[c] || 0) + i.v; });
        if (pieFilter === 'all' || pieFilter === 'credit') (db.credit || []).forEach(i => { const c = i.c || 'Outros'; cats[c] = (cats[c] || 0) + i.v; });
        myChart = new Chart(ctx,{
            type: 'doughnut',
            data: {
                labels: Object.keys(cats),
                datasets: [{data:Object.values(cats), backgroundColor:['#ef4444', '#f97316', '#facc15', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'], borderWidth:0}]
            },
            options: {responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right', labels:{color:textColor, font:{size:10}, boxWidth:10}}}}
        });
    }
}

function updateReport(f) {
    try {
        document.querySelectorAll('.rep-btn').forEach(b => b.classList.remove('active'));
        event.target.classList.add('active');
        const d = getDB(dataNav.getFullYear(), dataNav.getMonth());
        const rep = calcularRepasses(dataNav.getFullYear(), dataNav.getMonth());
        let list = [];
        if (f === 'all' || f === 'in') {
            if (rep.sobra > 0) list.push({ n: 'Sobra Anterior', v: rep.sobra, t: 'in' });
            d.in.forEach(i => list.push({ ...i, t: 'in' }));
        }
        if (f === 'all' || f === 'out') {
            if (rep.divida > 0) list.push({ n: 'Dívida Anterior', v: rep.divida, t: 'out' });
            d.debit.forEach(i => list.push({ ...i, t: 'out' }));
            d.credit.forEach(i => list.push({ ...i, t: 'out' }));
        }
        list.sort((a, b) => (a.d || 0) - (b.d || 0));
        let html = '<ul class="report-list">';
        list.forEach(i => {
            const day = i.d ? String(i.d).padStart(2, '0') : '01';
            const cls = i.t === 'in' ? 'rep-green' : 'rep-red';
            const sig = i.t === 'in' ? '+' : '-';
            html += `<li class="report-row"><div class="report-left"><span class="report-day">${day}</span><span>${i.n}</span></div><div class="report-val ${cls}">${sig} ${fmt(i.v)}</div></li>`;
        });
        html += '</ul>';
        const sumIn = list.filter(i => i.t === 'in').reduce((a, b) => a + b.v, 0);
        const sumOut = list.filter(i => i.t === 'out').reduce((a, b) => a + b.v, 0);
        html += `<div style="margin-top:15px; border-top:2px solid #e2e8f0; padding-top:10px"><div style="display:flex;justify-content:space-between"><span>Entradas:</span> <strong class="rep-green">${fmt(sumIn)}</strong></div><div style="display:flex;justify-content:space-between"><span>Saídas:</span> <strong class="rep-red">${fmt(sumOut)}</strong></div><div style="display:flex;justify-content:space-between; margin-top:5px; font-size:1.1rem; font-weight:bold"><span>Saldo:</span> <span>${fmt(sumIn - sumOut)}</span></div></div>`;
        document.getElementById('reportContent').innerHTML = html;
        const mName = dataNav.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        document.getElementById('repSubtitle').innerText = mName.charAt(0).toUpperCase() + mName.slice(1);
    } catch (e) {
        console.error(e);
        alert("Erro ao gerar relatório.");
    }
}
function openReport() {
    updateReport('all');
    document.getElementById('reportModal').style.display = 'flex';
}
function exportPDF() {
    const btn = document.getElementById('btnPdf');
    const originalText = btn.innerText;
    btn.innerText = "⏳ Gerando...";
    setTimeout(() => {
        const original = document.getElementById('printableArea');
        const clone = original.cloneNode(true);
        clone.style.width = '700px';
        clone.style.display = 'block';
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        tempDiv.appendChild(clone);
        document.body.appendChild(tempDiv);
        const opt = { margin: 10, filename: `Extrato_${dataNav.getMonth() + 1}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
        html2pdf().set(opt).from(clone).save().then(() => {
            document.body.removeChild(tempDiv);
            btn.innerText = originalText;
        });
    }, 100);
}

function render() {
    const a = dataNav.getFullYear();
    const m = dataNav.getMonth();
    const d = getDB(a, m);
    const yStr = a;
    const mStr = String(m + 1).padStart(2, '0');
    document.getElementById('navMonth').value = `${yStr}-${mStr}`;
    const lastDay = new Date(a,m + 1,0).getDate();
    const isCurrent = (a === hoje.getFullYear() && m === hoje.getMonth());
    ['inDate', 'debDate', 'credDate'].forEach(id => { document.getElementById(id).value = isCurrent ? hoje.getDate() : 1; });

    const rep = calcularRepasses(a, m);
    const sIn = (d.in || []).reduce((acc, x) => acc + x.v, 0);
    const sDeb = (d.debit || []).reduce((acc, x) => acc + x.v, 0);
    const sCred = (d.credit || []).reduce((acc, x) => acc + x.v, 0);

    renderList('listIn', d.in || [], 'in', rep.sobra > 0 ? { n: '💰 Sobra Anterior', v: rep.sobra, special: true } : null);
    renderList('listDebit', d.debit || [], 'debit');
    renderList('listCredit', d.credit || [], 'credit', rep.divida > 0 ? { n: '⚠️ Pendência Anterior', v: rep.divida, special: true, type: 'debt' } : null);

    const closing = getBusinessClosingDate(a, m);
    document.getElementById('credCutoffLabel').innerText = `Fecha dia ${closing}`;

    const ulW = document.getElementById('listWish');
    ulW.innerHTML = "";
    if (dbGlobal.wishes.length === 0) ulW.innerHTML = "<div class='empty-msg'>Lista vazia</div>";
    dbGlobal.wishes.forEach((it, i) => {
        ulW.innerHTML += `<li class="item"><div class="item-main"><span>${it.n}</span><div><strong class="blur-target">${fmt(it.v)}</strong><button style="margin-left:5px; background:var(--purple); color:white; border:none; border-radius:4px; cursor:pointer" onclick="openBuyModal(${i})">Comprar</button><span class="del" onclick="del('wishes',${i})">✕</span></div></div>${generateAdvice(it.v)}</li>`;
    });

    const totIn = sIn + rep.sobra;
    const totFat = sCred + rep.divida;
    const disp = totIn - sDeb - totFat;
    document.getElementById('totIn').innerText = fmt(totIn);
    document.getElementById('totDebit').innerText = fmt(sDeb);
    document.getElementById('totCredit').innerText = fmt(totFat);
    document.getElementById('valSaldoLiq').innerText = fmt(disp);
    document.getElementById('invPaid').value = d.invoicePaid || "";
    const dr = Math.max(1, (lastDay - diaSel) + 1);
    const diario = disp / dr;
    document.getElementById('valDiario').innerText = fmt(diario);
    document.getElementById('valSemanal').innerText = fmt(diario * 7);
    document.getElementById('infoDias').innerText = `${dr} dias restantes`;
    const pnl = document.getElementById('painelRes');
    pnl.className = "result-card";
    pnl.classList.remove('bg-safe', 'bg-warning', 'bg-danger');
    if (disp <= 0) {
        pnl.classList.add("bg-danger");
        document.getElementById('labelStatus').innerText = "⚠️ Negativo";
    } else if (diario < settings.dailyGoal) {
        pnl.classList.add("bg-warning");
        document.getElementById('labelStatus').innerText = "⚠️ Cuidado";
    } else {
        pnl.classList.add("bg-safe");
        document.getElementById('labelStatus').innerText = "✅ Confortável";
    }
    updateCalendar(a, m, lastDay);
    updateGlobalLimit();
    renderChart(a, m);
}

function toggleBox(id) { document.getElementById(id).classList.toggle('collapsed'); }
function add(tipo) {
    let targetY = dataNav.getFullYear();
    let targetM = dataNav.getMonth();

    let nId, vId, dId, cId, oId;
    if (tipo === 'in') { nId='inNome'; vId='inVal'; dId='inDate'; cId='catIn'; oId='inObs'; } 
    else if (tipo === 'debit') { nId='debNome'; vId='debVal'; dId='debDate'; cId='catDeb'; oId='debObs'; } 
    else if (tipo === 'credit') { nId='credNome'; vId='credVal'; dId='credDate'; cId='catCred'; oId='credObs'; } 
    else {
        const n = document.getElementById('wishNome').value;
        const v = parseFloat(document.getElementById('wishVal').value);
        if (n && v > 0) {
            dbGlobal.wishes.push({ n, v });
            localStorage.setItem('appV25_g', JSON.stringify(dbGlobal));
            document.getElementById('wishNome').value = '';
            document.getElementById('wishVal').value = '';
            render();
        } else alert("Preencha corretamente.");
        return;
    }

    const elN = document.getElementById(nId);
    const elV = document.getElementById(vId);
    const elObs = document.getElementById(oId);
    const elDate = document.getElementById(dId);

    if (elN && elV) {
        const n = elN.value;
        const v = parseFloat(elV.value);
        const o = elObs ? elObs.value : '';
        let dVal = parseInt(elDate.value) || 1; 

        if (n && !isNaN(v) && v > 0) {
            if (tipo === 'credit') {
                const closingDay = getBusinessClosingDate(targetY, targetM);
                if (dVal >= closingDay) { 
                    alert(`📅 Compra após fechamento (${closingDay}). Lançado para o 1º dia do mês seguinte!`);
                    targetM++;
                    if (targetM > 11) { targetM = 0; targetY++; }
                    dVal = 1; 
                }
            }

            const db = getDB(targetY, targetM);
            let tArr = (tipo==='in') ? db.in : (tipo==='debit' ? db.debit : db.credit);
            const cat = document.getElementById(cId).value;
            tArr.push({ n, v, d: dVal, c: cat, o: o });
            
            if (targetY !== dataNav.getFullYear() || targetM !== dataNav.getMonth()) {
               localStorage.setItem(getKey(targetY, targetM), JSON.stringify(db));
               render();
            } else {
               save();
            }
            
            elN.value = ''; elV.value = ''; if (elObs) elObs.value = '';
        } else alert("Preencha corretamente.");
    }
}
function del(t, i) {
    if (confirm("Apagar?")) {
        if (t === 'wishes') {
            dbGlobal.wishes.splice(i, 1);
            localStorage.setItem('appV25_g', JSON.stringify(dbGlobal));
            render();
        } else {
            getDB(dataNav.getFullYear(), dataNav.getMonth())[t].splice(i, 1);
            save();
        }
    }
}
function copyPrev(t) {
    let pd = new Date(dataNav.getFullYear(),dataNav.getMonth() - 1,1);
    let pk = getKey(pd.getFullYear(), pd.getMonth());
    if (!localStorage.getItem(pk)) return alert("Sem dados anteriores.");
    let pData = JSON.parse(localStorage.getItem(pk));
    if (!pData[t] || pData[t].length === 0) return alert("Nada para copiar.");
    if (confirm("Copiar itens?")) {
        const cDB = getDB(dataNav.getFullYear(), dataNav.getMonth());
        pData[t].forEach(it => cDB[t].push({ n: it.n, v: it.v, d: 1, c: it.c, o: it.o }));
        save();
    }
}
function populateSelects() {
    const exp = dbGlobal.catExp.map(c => `<option value="${c.i} ${c.n}">${c.i} ${c.n}</option>`).join('');
    document.getElementById('catDeb').innerHTML = exp;
    document.getElementById('catCred').innerHTML = exp;
    document.querySelectorAll('.dynamic-cat-expense').forEach(s => s.innerHTML = exp);
    document.getElementById('catIn').innerHTML = dbGlobal.catInc.map(c => `<option value="${c.i} ${c.n}">${c.i} ${c.n}</option>`).join('');
}
function openCatModal() { renderCats(); document.getElementById('catModal').style.display = 'flex'; }
function renderCats() {
    document.getElementById('listCatExp').innerHTML = dbGlobal.catExp.map((c, i) => `<li class="cat-item-edit"><span>${c.i} ${c.n}</span><button class="del" onclick="rmCat('expense',${i})">✕</button></li>`).join('');
    document.getElementById('listCatInc').innerHTML = dbGlobal.catInc.map((c, i) => `<li class="cat-item-edit"><span>${c.i} ${c.n}</span><button class="del" onclick="rmCat('income',${i})">✕</button></li>`).join('');
}
function addNewCat(t) {
    const ic = document.getElementById(t === 'expense' ? 'newCatExpIcon' : 'newCatIncIcon').value || '🔹';
    const nm = document.getElementById(t === 'expense' ? 'newCatExpName' : 'newCatIncName').value;
    if (nm) {
        if (t === 'expense') dbGlobal.catExp.push({ n: nm, i: ic });
        else dbGlobal.catInc.push({ n: nm, i: ic });
        localStorage.setItem('appV25_g', JSON.stringify(dbGlobal));
        renderCats();
        populateSelects();
    }
}
function rmCat(t, i) {
    if (confirm("Remover?")) {
        if (t === 'expense') dbGlobal.catExp.splice(i, 1);
        else dbGlobal.catInc.splice(i, 1);
        localStorage.setItem('appV25_g', JSON.stringify(dbGlobal));
        renderCats();
        populateSelects();
    }
}
function openFixedModal() { renderFixed(); document.getElementById('fixedModal').style.display = 'flex'; }
function addFixed() {
    const n = document.getElementById('fixName').value;
    const v = parseFloat(document.getElementById('fixVal').value);
    const d = parseInt(document.getElementById('fixDay').value) || 1;
    const t = document.getElementById('fixType').value;
    const c = document.getElementById('fixCat').value;
    if (n && v > 0) {
        dbGlobal.fixed.push({ n, v, d, t, c });
        localStorage.setItem('appV25_g', JSON.stringify(dbGlobal));
        renderFixed();
    }
}
function delFixed(i) { dbGlobal.fixed.splice(i, 1); localStorage.setItem('appV25_g', JSON.stringify(dbGlobal)); renderFixed(); }
function renderFixed() { document.getElementById('listFixed').innerHTML = dbGlobal.fixed.map((it, i) => `<li class="item" style="display:flex;justify-content:space-between"><div>${it.n} (Dia ${it.d})</div><div><strong>${fmt(it.v)}</strong><span class="del" onclick="delFixed(${i})">✕</span></div></li>`).join(''); }
function forceLaunchFixed() {
    if (confirm("Lançar fixas agora?")) {
        const db = getDB(dataNav.getFullYear(), dataNav.getMonth());
        dbGlobal.fixed.forEach(it => {
            if (it.t === 'debit') db.debit.push({ n: it.n + ' (Fixo)', v: it.v, d: it.d, c: it.c });
            else db.credit.push({ n: it.n + ' (Fixo)', v: it.v, d: it.d, c: it.c });
        });
        db.fixedLaunched = true;
        save();
        document.getElementById('fixedModal').style.display = 'none';
    }
}
function checkFixedExpenses() {
    const k = getKey(hoje.getFullYear(), hoje.getMonth());
    const db = localStorage.getItem(k) ? JSON.parse(localStorage.getItem(k)) : null;
    if (dbGlobal.fixed.length > 0 && (!db || !db.fixedLaunched)) {
        setTimeout(() => {
            if (confirm("Lançar despesas fixas?")) {
                const ndb = getDB(hoje.getFullYear(), hoje.getMonth());
                dbGlobal.fixed.forEach(it => {
                    if (it.t === 'debit') ndb.debit.push({ n: it.n + ' (Fixo)', v: it.v, d: it.d, c: it.c });
                    else ndb.credit.push({ n: it.n + ' (Fixo)', v: it.v, d: it.d, c: it.c });
                });
                ndb.fixedLaunched = true;
                localStorage.setItem(k, JSON.stringify(ndb));
                if (dataNav.getMonth() === hoje.getMonth()) render();
            }
        }, 1000);
    }
}
function openBuyModal(i) {
    selectedWishIndex = i;
    const it = dbGlobal.wishes[i];
    document.getElementById('modalItemName').innerText = it.n;
    document.getElementById('buyModal').style.display = 'flex';
    toggleInstallments();
}
function closeBuyModal() { document.getElementById('buyModal').style.display = 'none'; }
function toggleInstallments() { document.getElementById('creditOptions').style.display = document.getElementById('modalType').value === 'credit' ? 'block' : 'none'; }
function confirmBuy() {
    const it = dbGlobal.wishes[selectedWishIndex];
    const t = document.getElementById('modalType').value;
    const c = document.getElementById('modalCat').value;
    if (t === 'debit') {
        const db = getDB(dataNav.getFullYear(), dataNav.getMonth());
        db.debit.push({ n: it.n, v: it.v, d: diaSel, c: c });
        save();
    } else {
        const p = parseInt(document.getElementById('modalInstallments').value) || 1;
        const s = document.getElementById('modalStartMonth').value;
        let[y,m] = s.split('-').map(Number);
        m--;
        
        const closingDay = getBusinessClosingDate(y, m);
        if (y === dataNav.getFullYear() && m === dataNav.getMonth()) {
                if (diaSel >= closingDay) {
                    alert(`📅 Fatura fechada (${closingDay}). Parcelamento inicia no mês seguinte!`);
                    m++;
                    if (m > 11) { m = 0; y++; }
                }
        }

        const vP = it.v / p;
        for (let i = 0; i < p; i++) {
            let cM = m + i;
            let cY = y;
            while (cM > 11) { cM -= 12; cY++; }
            const k = getKey(cY, cM);
            const dF = localStorage.getItem(k) ? JSON.parse(localStorage.getItem(k)) : { in: [], debit: [], credit: [] };
            dF.credit.push({ n: `${it.n} (${i + 1}/${p})`, v: vP, d: 1, c: c });
            localStorage.setItem(k, JSON.stringify(dF));
        }
    }
    dbGlobal.wishes.splice(selectedWishIndex, 1);
    localStorage.setItem('appV25_g', JSON.stringify(dbGlobal));
    closeBuyModal();
    render();
}
function fmt(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function mudarMes(v) { dataNav.setMonth(dataNav.getMonth() + v); diaSel = 1; render(); }
function pickMonth(v) { const [y,m] = v.split('-'); dataNav.setFullYear(y); dataNav.setMonth(m - 1); render(); }
function switchTab(t) {
    document.getElementById('viewBudget').classList.toggle('active', t === 'budget');
    document.getElementById('viewWishes').classList.toggle('active', t === 'wishes');
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === (t === 'budget' ? 0 : 1)));
}
function switchDash(m) {
    document.getElementById('dash-nums').classList.toggle('active', m === 'nums');
    document.getElementById('dash-graph').classList.toggle('active', m === 'graph');
    document.querySelectorAll('.dash-tab-btn').forEach((b, i) => b.classList.toggle('active', i === (m === 'nums' ? 0 : 1)));
}
function openSetupModal() {
    document.getElementById('setupModal').style.display = 'flex';
    document.getElementById('setupLimit').value = settings.limit;
    document.getElementById('setupGoal').value = settings.dailyGoal;
}
function saveSetup() {
    settings.limit = parseFloat(document.getElementById('setupLimit').value) || 4000;
    settings.dailyGoal = parseFloat(document.getElementById('setupGoal').value) || 30;
    localStorage.setItem('appV25_settings', JSON.stringify(settings));
    document.getElementById('setupModal').style.display = 'none';
    render();
}
function exportData() {
    const d = {};
    Object.keys(localStorage).forEach(k => { if (k.startsWith('appV25_')) d[k] = localStorage.getItem(k); });
    const b = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u; a.download = 'backup.json'; a.click();
}
function importData(i) {
    const r = new FileReader();
    r.onload = (e) => {
        const d = JSON.parse(e.target.result);
        Object.keys(d).forEach(k => localStorage.setItem(k, d[k]));
        alert("Ok!");
        location.reload();
    };
    r.readAsText(i.files[0]);
}
function checkShortcuts() {
    const p = new URLSearchParams(window.location.search).get('acao');
    if (p) {
        setTimeout(() => {
            let b = null, i = null;
            if (p === 'nova_entrada') { b = 'boxIn'; i = 'inVal'; }
            if (p === 'novo_debito') { b = 'boxDeb'; i = 'debVal'; }
            if (p === 'novo_credito') { b = 'boxCred'; i = 'credVal'; }
            if (b) { document.getElementById(b).scrollIntoView(); document.getElementById(i).focus(); }
        }, 500);
    }
}
function updateGlobalLimit() {
    let u = 0;
    Object.keys(localStorage).forEach(k => {
        if (k.startsWith('appV25_m_')) {
            const d = JSON.parse(localStorage.getItem(k));
            u += d.credit.reduce((a, b) => a + b.v, 0);
            u -= (d.invoicePaid || 0);
        }
    });
    const p = Math.min(100, Math.max(0, (u / settings.limit) * 100));
    document.getElementById('barCredit').style.width = p + '%';
    document.getElementById('txtCreditLimit').innerText = `${fmt(u)} / ${fmt(settings.limit)}`;
}
function calcularRepasses(a, m) {
    let divida = 0, sobra = 0;
    const keys = Object.keys(localStorage).filter(k => k.startsWith('appV25_m_')).sort();
    keys.forEach(key => {
        const [,,kAno,kMes] = key.split('_').map(Number);
        if (kAno < a || (kAno === a && kMes < m)) {
            const mData = JSON.parse(localStorage.getItem(key));
            const mCred = mData.credit.reduce((acc, x) => acc + x.v, 0);
            const mPaid = mData.invoicePaid || 0;
            if (mPaid > 0) {
                const faturaReal = mCred + divida;
                const balanco = mPaid - faturaReal;
                if (balanco >= 0) { sobra = balanco; divida = 0; } 
                else { divida = Math.abs(balanco); sobra = 0; }
            } else { divida = 0; sobra = 0; }
        }
    });
    return { sobra, divida };
}
function updateCalendar(a, m, ld) {
    const g = document.getElementById('gridCal');
    if(!g) return;
    g.innerHTML = "";
    const d = getDB(a, m);
    const spendingByDay = {}; 
    const discretionaryByDay = {}; 
    let maxSpend = 0;
    const allExpenses = [...(d.debit || []), ...(d.credit || [])];
    allExpenses.forEach(it => {
        const day = it.d || 1;
        spendingByDay[day] = (spendingByDay[day] || 0) + it.v;
        if (spendingByDay[day] > maxSpend) maxSpend = spendingByDay[day];
        if (it.n && !it.n.includes('(Fixo)')) { discretionaryByDay[day] = (discretionaryByDay[day] || 0) + it.v; }
    });
    const now = new Date();
    const currentRealMonth = now.getMonth();
    const currentRealYear = now.getFullYear();
    const currentRealDay = now.getDate();
    for (let i = 1; i <= ld; i++) {
        const div = document.createElement('div');
        let className = `day ${i === diaSel ? 'active' : ''} ${i === hoje.getDate() && m === hoje.getMonth() && a === hoje.getFullYear() ? 'today' : ''}`;
        if (spendingByDay[i] > 0) {
            const ratio = spendingByDay[i] / (maxSpend || 1);
            if (ratio > 0.6) className += ' heat-3';
            else if (ratio > 0.3) className += ' heat-2';
            else className += ' heat-1';
        }
        const isFuture = (a > currentRealYear) || (a === currentRealYear && m > currentRealMonth) || (a === currentRealYear && m === currentRealMonth && i > currentRealDay);
        if (!isFuture && (!discretionaryByDay[i] || discretionaryByDay[i] === 0)) { className += ' no-spend'; }
        div.className = className; div.innerText = i; div.onclick = () => { diaSel = i; render(); };
        g.appendChild(div);
    }
}
function payInvoice() {
    const val = parseFloat(document.getElementById('invPaid').value);
    if (isNaN(val) && val !== 0) { alert("Valor inválido."); return; }
    const db = getDB(dataNav.getFullYear(), dataNav.getMonth());
    db.invoicePaid = val; save(); alert("Pagamento atualizado com sucesso!");
}