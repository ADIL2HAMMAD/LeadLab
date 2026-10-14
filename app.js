(() => {
  'use strict';
  const { modules, plan, cases, sources } = window.LEADLAB;
  const allQuestions = modules.flatMap(m => m.questions.map(q => ({ ...q, module: m.id })));
  const allQuizzes = modules.flatMap(m => m.quizzes.map(q => ({ ...q, module: m.id })));
  const questionMap = new Map(allQuestions.map(q => [q.id, q]));
  const quizMap = new Map(allQuizzes.map(q => [q.id, q]));
  const promptMap = new Map([...allQuestions, ...cases].map(q => [q.id, q]));
  const moduleMap = new Map(modules.map(m => [m.id, m]));
  const STORAGE_KEY = 'leadlab.progress.v1';
  const main = document.getElementById('main');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const formatDate = value => new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(new Date(value + 'T12:00:00')) === value;
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const array = value => Array.isArray(value) ? value : [];
  const unique = values => [...new Set(values)];
  const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  const cleanText = value => typeof value === 'string' ? value.slice(0, 10000) : '';
  const blankState = () => ({ version: 1, mastered: [], favorites: [], notes: {}, days: [], startDate: dateKey(), quizzes: [], interviews: [], activeQuiz: null, activeInterview: null });
  const ratingKeys = ['precision', 'reasoning', 'clarity', 'tradeoffs'];
  function cleanRatings(raw, ids) {
    const result = {};
    for (const id of ids) {
      result[id] = {};
      for (const key of ratingKeys) {
        if (integer(raw?.[id]?.[key], 0, 3)) result[id][key] = raw[id][key];
      }
    }
    return result;
  }
  function cleanNotes(raw, ids) {
    const result = {};
    for (const id of ids) if (typeof raw?.[id] === 'string') result[id] = cleanText(raw[id]);
    return result;
  }
  function cleanAnswers(raw) {
    const seen = new Set();
    return array(raw).filter(a => {
      if (!a || !quizMap.has(a.id) || !integer(a.choice, 0, 3) || seen.has(a.id)) return false;
      seen.add(a.id); return true;
    }).slice(0, allQuizzes.length).map(a => ({ id: a.id, choice: a.choice }));
  }
  function normalize(raw) {
    if (!raw || raw.version !== 1) throw new Error('Format de sauvegarde incompatible.');
    const next = blankState();
    next.mastered = unique(array(raw.mastered).filter(id => questionMap.has(id)));
    next.favorites = unique(array(raw.favorites).filter(id => questionMap.has(id)));
    next.notes = cleanNotes(raw.notes, [...questionMap.keys()]);
    next.days = unique(array(raw.days).filter(day => integer(day, 1, 14)));
    next.startDate = validDate(raw.startDate) ? raw.startDate : dateKey();
    next.quizzes = array(raw.quizzes).slice(-100).filter(h => h && validTime(h.at)).map(h => ({ at: h.at, answers: cleanAnswers(h.answers) })).filter(h => h.answers.length);
    next.interviews = array(raw.interviews).slice(-50).filter(h => h && validTime(h.at)).map(h => {
      const ids = unique(array(h.ids).filter(id => promptMap.has(id))).slice(0, 8);
      return { at: h.at, ids, notes: cleanNotes(h.notes, ids), ratings: cleanRatings(h.ratings, ids) };
    }).filter(h => h.ids.length);
    const aq = raw.activeQuiz;
    if (aq && Array.isArray(aq.items) && aq.items.length > 0 && aq.items.length <= allQuizzes.length) {
      const valid = unique(aq.items.map(i => i?.id)).length === aq.items.length && aq.items.every(i => quizMap.has(i?.id) && array(i.order).length === 4 && unique(i.order).length === 4 && i.order.every(n => integer(n, 0, 3)));
      const answers = cleanAnswers(aq.answers);
      const index = aq.index;
      const submitted = aq.submitted === true;
      if (valid && integer(index, 0, aq.items.length - 1) && answers.length === index + (submitted ? 1 : 0) && answers.every((a, i) => a.id === aq.items[i].id)) {
        next.activeQuiz = { items: aq.items.map(i => ({ id: i.id, order: [...i.order] })), answers, index, submitted, selected: integer(aq.selected, 0, 3) ? aq.selected : null };
        if (submitted) next.activeQuiz.selected = answers[index].choice;
      }
    }
    const ai = raw.activeInterview;
    if (ai) {
      const ids = unique(array(ai.ids).filter(id => promptMap.has(id))).slice(0, 8);
      if (ids.length && integer(ai.index, 0, ids.length - 1)) {
        let remainingMs = Number.isFinite(ai.remainingMs) ? Math.max(0, Math.min(ai.remainingMs, ids.length * 300000)) : ids.length * 300000;
        if (ai.running && Number.isFinite(ai.deadline)) remainingMs = Math.min(remainingMs, Math.max(0, ai.deadline - Date.now()));
        next.activeInterview = { ids, index: ai.index, notes: cleanNotes(ai.notes, ids), ratings: cleanRatings(ai.ratings, ids), remainingMs, running: false, deadline: null, revealed: unique(array(ai.revealed).filter(id => ids.includes(id))) };
      }
    }
    return next;
  }
  let state = blankState();
  let storageAvailable = true;
  let startupMessage = '';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { state = normalize(JSON.parse(stored)); }
      catch { startupMessage = 'Sauvegarde locale illisible : une session vide a été ouverte. Vous pouvez importer une sauvegarde dans Mes données.'; }
    }
    localStorage.setItem('leadlab.storage-check', '1');
    localStorage.removeItem('leadlab.storage-check');
  } catch { storageAvailable = false; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
    catch { storageAvailable = false; }
    document.getElementById('storage-warning').hidden = storageAvailable;
  }
  document.getElementById('storage-warning').hidden = storageAvailable;
  let toastTimer;
  function toast(message) {
    const box = document.getElementById('toast');
    box.textContent = message; box.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.remove('visible'), 4200);
  }
  async function confirmAction(title, message) {
    const dialog = document.getElementById('confirm-dialog');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    dialog.returnValue = 'cancel';
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
  }
  const paths = {
    dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    book:'<path d="M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-2-1-6-2-10 1Z"/><path d="M12 5v16"/>',
    quiz:'<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-14 4h3m4 0h3m-10 3h3"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    chart:'<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    play:'<path d="m8 4 12 8-12 8Z"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.book}</svg>`;
  const navItems = [['dashboard','dashboard','Accueil'],['modules','book','Fiches'],['quiz','quiz','Quiz'],['interview','mic','Entretien'],['progress','chart','Progression']];
  const extraPages = { plan:'Planning 14 jours', settings:'Mes données', sources:'Références & méthode' };
  const heading = (title, subtitle, action = '') => `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  const percent = (n, total) => total ? Math.round(n / total * 100) : 0;
  const bar = (value, label = 'Progression') => `<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-label="${label}"><div class="progress-fill" style="width:${value}%"></div></div>`;
  const masteredCount = module => module.questions.filter(q => state.mastered.includes(q.id)).length;
  const score = history => history.answers.filter(a => quizMap.get(a.id).correct === a.choice).length;
  const overallQuiz = () => { const answers = state.quizzes.flatMap(h => h.answers); return answers.length ? percent(answers.filter(a => quizMap.get(a.id).correct === a.choice).length, answers.length) : null; };
  const nextDay = () => plan.find(d => !state.days.includes(d.day));
  const moduleOptions = (selected = 'all') => `<option value="all"${selected === 'all' ? ' selected' : ''}>Tous les modules</option>${modules.map(m => `<option value="${m.id}"${selected === m.id ? ' selected' : ''}>${m.title}</option>`).join('')}`;
  function moduleCard(m) {
    const count = masteredCount(m), total = m.questions.length, pct = percent(count, total);
    const hours = Math.max(1, Math.round(total * 3 / 60));
    return `<a class="module-card" href="#module/${m.id}" style="--module-bg:${m.bg};--module-color:${m.color}"><span class="module-icon" aria-hidden="true">${m.symbol}</span><strong>${m.title}</strong><span class="module-desc">${m.description}</span>${bar(pct, `Progression ${m.title}`)}<span class="module-count"><b>${count}</b> / ${total} maîtrisées · ~${hours} h</span></a>`;
  }
  function renderDashboard() {
    const day = nextDay();
    const success = overallQuiz();
    const next = allQuestions.find(q => !state.mastered.includes(q.id)) || allQuestions[0];
    const nextModule = moduleMap.get(next.module);
    const nextHref = `#module/${next.module}/${next.id}`;
    const cards = modules.map(moduleCard).join('');
    main.innerHTML = `<h1 class="visually-hidden">Tableau de bord</h1>
      <section class="resume" aria-labelledby="resume-title">
        <div class="resume-main">
          <p class="kicker"><span class="mark">${state.mastered.length ? 'Prochaine fiche' : 'Première fiche'}</span> ${nextModule.title} · ${next.level}</p>
          <h2 id="resume-title" class="resume-question"><a href="${nextHref}">${escape(next.title)}</a></h2>
          <p class="resume-hint">Répondez à voix haute pendant deux minutes. Ouvrez ensuite la fiche et comparez le mécanisme, l’exemple et les compromis.</p>
          <div class="button-row"><a class="button primary" href="${nextHref}">Ouvrir la fiche ${icon('arrow')}</a><a class="button secondary" href="#quiz">${icon('quiz')} Quiz express</a><a class="button secondary" href="#interview">${icon('mic')} Entretien blanc</a></div>
        </div>
        <dl class="ledger">
          <div><dt>Fiches maîtrisées</dt><dd>${state.mastered.length}<small> / ${allQuestions.length}</small></dd></div>
          <div><dt>Réussite aux quiz</dt><dd>${success === null ? '—' : `${success}<small> %</small>`}</dd></div>
          <div><dt>Jours validés</dt><dd>${state.days.length}<small> / 14</small></dd></div>
          <div><dt>Entretiens blancs</dt><dd>${state.interviews.length}</dd></div>
        </dl>
      </section>
      <div class="dashboard-columns">
        <section aria-labelledby="map-title">
          <div class="section-heading"><div><h2 id="map-title">Choisissez un thème</h2><p>${modules.length} modules, ${allQuestions.length} questions : ouvrez-en un pour voir sa liste.</p></div><a class="text-link" href="#modules">Rechercher une question →</a></div>
          <div class="module-grid">${cards}</div>
        </section>
        <aside class="rail">
          <section class="rail-card"><span class="eyebrow">${day ? `Prochaine étape · jour ${String(day.day).padStart(2,'0')}` : 'Parcours terminé'}</span><h3>${day ? day.title : 'Gardez le rythme'}</h3><p>${day ? day.objective : 'Reprenez vos points faibles et passez un nouvel entretien blanc.'}</p><ul class="mini-checklist">${(day ? day.tasks : ['Revoir les erreurs des quiz.','Répéter une simulation.']).map(t => `<li>${icon('check')}<span>${t}</span></li>`).join('')}</ul><a class="button secondary" href="#plan${day ? `/${day.day}` : ''}">${day ? `Voir le jour ${day.day}` : 'Revoir le planning'} ${icon('arrow')}</a></section>
          <section class="rail-card"><span class="eyebrow">Quiz</span><h3>Dix questions, dix minutes</h3><p>Les choix sont mélangés. Chaque erreur renvoie vers la fiche à relire.</p><a class="button secondary" href="#quiz">${icon('quiz')} Lancer un quiz</a></section>
          <div class="tip"><strong>Le réflexe Tech Lead</strong>Après chaque réponse, ajoutez : « Dans quel contexte ferais-je un autre choix ? »</div>
        </aside>
      </div>`;
  }
  let libraryFilter = { module:'all', status:'all', level:'all', search:'', all:false };
  let moduleView = { id:'', status:'all', level:'all' };
  const levels = ['Fondamental','Intermédiaire','Avancé'];
  const searchIndex = new Map();
  let libraryVisibleCount = 25;
  function questionHTML(q, open = false) {
    const done = state.mastered.includes(q.id), favorite = state.favorites.includes(q.id);
    return `<details class="question-card${done ? ' mastered' : ''}" id="question-${q.id}"${open ? ' open' : ''}><summary><span class="question-check">${done ? icon('check') : icon('book')}</span><span><span class="question-meta"><span class="pill">${moduleMap.get(q.module).short}</span><span class="pill">${q.level}</span></span><span class="question-title">${escape(q.title)}</span></span></summary><div class="answer">${answerHTML(q)}<div class="answer-actions"><button class="button ${done ? 'primary' : 'secondary'} small" data-action="master" data-id="${q.id}" aria-pressed="${done}">${icon('check')} ${done ? 'Maîtrisée' : 'Marquer comme maîtrisée'}</button><button class="button secondary small" data-action="favorite" data-id="${q.id}" aria-pressed="${favorite}">${icon('star')} ${favorite ? 'Retirer des favoris' : 'Garder en favori'}</button></div><details class="notes"${state.notes[q.id] ? ' open' : ''}><summary>Mes notes personnelles ${state.notes[q.id] ? '· enregistrées' : ''}</summary><label class="field"><span>Notes pour cette fiche</span><textarea data-note="${q.id}" maxlength="10000" placeholder="Votre exemple, un point à revoir, une expérience à raconter…">${escape(state.notes[q.id] || '')}</textarea></label></details></div></details>`;
  }
  function answerHTML(q) {
    return `<div class="answer-cols"><div class="answer-text">${q.answer.map(p => `<p>${escape(p)}</p>`).join('')}${q.code ? `<pre><code>${escape(q.code)}</code></pre>` : ''}</div><aside class="answer-margin"><div class="pitfall"><strong>Piège</strong>${escape(q.pitfall)}</div><h4>Relances possibles</h4><ul>${q.followup.map(t => `<li>${escape(t)}</li>`).join('')}</ul></aside></div>`;
  }
  const fold = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function searchText(q) {
    if (!searchIndex.has(q.id)) searchIndex.set(q.id, fold([q.title,...q.answer,q.pitfall,q.code,...q.followup].join(' ')));
    return searchIndex.get(q.id);
  }
  const isBrowsing = () => libraryFilter.all || libraryFilter.search.trim() !== '' || libraryFilter.module !== 'all' || libraryFilter.status !== 'all' || libraryFilter.level !== 'all';
  function filterQuestions() {
    const query = fold(libraryFilter.search.trim());
    return allQuestions.filter(q => (libraryFilter.module === 'all' || q.module === libraryFilter.module) &&
      (libraryFilter.status === 'all' || libraryFilter.status === 'todo' && !state.mastered.includes(q.id) || libraryFilter.status === 'done' && state.mastered.includes(q.id) || libraryFilter.status === 'favorites' && state.favorites.includes(q.id)) &&
      (libraryFilter.level === 'all' || q.level === libraryFilter.level) &&
      (!query || searchText(q).includes(query)));
  }
  function updateLibraryResults() {
    const browsing = isBrowsing();
    const grid = document.getElementById('module-grid'), results = document.getElementById('question-results'), count = document.getElementById('results-count');
    grid.hidden = browsing; results.hidden = !browsing; count.hidden = !browsing;
    if (!browsing) { results.innerHTML = ''; return; }
    const found = filterQuestions();
    const visible = found.slice(0,libraryVisibleCount);
    count.innerHTML = `${found.length} question${found.length > 1 ? 's' : ''} trouvée${found.length > 1 ? 's' : ''}${visible.length < found.length ? ` · ${visible.length} affichée${visible.length > 1 ? 's' : ''}` : ''} <button class="text-link linklike" data-action="clear-filters">← Retour aux modules</button>`;
    results.innerHTML = found.length ? visible.map(q => questionHTML(q)).join('') + (visible.length < found.length ? `<button class="button secondary load-more" data-action="load-more">Afficher ${Math.min(25,found.length-visible.length)} questions suivantes</button>` : '') : `<div class="empty-state"><h3>Aucune question pour ces filtres</h3><p>Essayez un autre mot ou revenez à la liste des modules.</p><button class="button secondary" data-action="clear-filters">Réinitialiser les filtres</button></div>`;
  }
  const selectOptions = (items, selected) => items.map(([id,title]) => `<option value="${id}"${selected === id ? ' selected' : ''}>${title}</option>`).join('');
  const levelOptions = selected => selectOptions([['all','Tous les niveaux'],...levels.map(l => [l,l])], selected);
  const statusOptions = selected => selectOptions([['all','Toutes les questions'],['todo','À réviser'],['done','Maîtrisées'],['favorites','Mes favoris']], selected);
  function renderModules() {
    main.innerHTML = heading('Les questions',`${allQuestions.length} questions corrigées, classées par thème. Choisissez un module ou cherchez un mot.`) +
      `<div class="filters"><label class="search-wrap">${icon('search')}<input class="search" id="search-questions" type="search" placeholder="Rechercher : transaction, useEffect, Kafka…" aria-label="Rechercher dans les questions" value="${escape(libraryFilter.search)}"></label><select class="filter" id="module-filter" aria-label="Module">${moduleOptions(libraryFilter.module)}</select><select class="filter" id="level-filter" aria-label="Niveau">${levelOptions(libraryFilter.level)}</select><select class="filter" id="status-filter" aria-label="Progression">${statusOptions(libraryFilter.status)}</select></div><div id="module-grid"><div class="module-grid">${modules.map(moduleCard).join('')}</div><div class="button-row center-row"><button class="button secondary" data-action="show-all">Voir toutes les questions</button></div></div><p class="results-count" id="results-count" role="status"></p><div class="question-list" id="question-results"></div>`;
    updateLibraryResults();
  }
  function moduleListHTML(m) {
    const items = m.questions.filter(q => (moduleView.level === 'all' || q.level === moduleView.level) && (moduleView.status === 'all' || (moduleView.status === 'todo') === !state.mastered.includes(q.id)));
    return items.length ? items.map(q => questionHTML({...q,module:m.id},false)).join('') : '<div class="empty-state"><h3>Rien à afficher ici</h3><p>Changez de niveau ou affichez toutes les questions du module.</p></div>';
  }
  function updateModuleList() {
    const m = moduleMap.get(moduleView.id), box = document.getElementById('module-questions');
    if (m && box) box.innerHTML = moduleListHTML(m);
  }
  function renderModule(id, questionId) {
    const m = moduleMap.get(id);
    if (!m) return renderNotFound();
    if (moduleView.id !== id || questionId) moduleView = { id, status:'all', level:'all' };
    main.innerHTML = heading(m.title,m.description,`<a class="text-link" href="#modules">← Tous les modules</a>`) +
      `<section class="module-banner"><span class="module-icon" style="--module-bg:${m.bg};--module-color:${m.color}">${m.symbol}</span><div><h2>${masteredCount(m)} / ${m.questions.length} questions maîtrisées</h2><p>${m.quizzes.length} questions de quiz · environ ${Math.max(1, Math.round(m.questions.length * 3 / 60))} h de révision</p></div><div class="button-row"><a class="button primary" href="#quiz/${m.id}">${icon('quiz')} Tester ce module</a></div></section><p class="welcome-note">Répondez à voix haute, puis ouvrez la question pour comparer votre réponse.</p><div class="filters filters-compact"><select class="filter" id="module-level-filter" aria-label="Niveau">${levelOptions(moduleView.level)}</select><select class="filter" id="module-status-filter" aria-label="Progression">${statusOptions(moduleView.status).replace(/<option value="favorites">[^<]*<\/option>/,'')}</select></div><div class="question-list" id="module-questions">${moduleListHTML(m)}</div>`;
    if (questionId && questionMap.get(questionId)?.module === id) requestAnimationFrame(() => { const card = document.getElementById(`question-${questionId}`); if (card) { card.open = true; card.scrollIntoView({ block:'start' }); } });
  }
  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i+1)); [result[i],result[j]] = [result[j],result[i]]; }
    return result;
  }
  function renderQuiz(selectedModule) {
    if (state.activeQuiz) return renderActiveQuiz();
    const selected = moduleMap.has(selectedModule) ? selectedModule : 'all';
    main.innerHTML = heading('Testez vos réflexes','Une réponse par question, une correction expliquée et des fiches pour approfondir.') +
      `<div class="two-columns"><section class="card quiz-config"><span class="eyebrow">ENTRAÎNEMENT ACTIF</span><h2>Votre prochaine session</h2><p class="muted small-copy" style="margin-top:10px">Les questions et les choix sont mélangés. Répondez avant de lire la correction, puis passez à la suite.</p><form id="quiz-config"><div class="config-fields"><label class="field">Module<select id="quiz-module">${moduleOptions(selected)}</select></label><label class="field">Nombre de questions<select id="quiz-count"><option value="5">5 questions · express</option><option value="10" selected>10 questions · régulier</option><option value="20">20 questions · approfondi</option><option value="all">Toutes les questions du choix</option></select></label></div><p class="welcome-note" id="quiz-pool-info">${selected === 'all' ? allQuizzes.length : moduleMap.get(selected).quizzes.length} questions disponibles. La session s’adapte à la taille du module.</p><button class="button primary" type="submit">${icon('play')} Démarrer le quiz</button></form></section><aside class="card"><span class="eyebrow">UNE MÉTHODE SIMPLE</span><h2>Comprendre vos erreurs</h2><ul class="mini-checklist"><li>${icon('check')}<span>Choisissez votre réponse sans ouvrir les fiches.</span></li><li>${icon('check')}<span>Validez pour afficher la correction et l’explication.</span></li><li>${icon('check')}<span>Retrouvez vos résultats et modules à renforcer dans votre progression.</span></li></ul><div class="notice">Le score évalue cette banque de questions. La maîtrise des fiches reste une auto-évaluation distincte.</div>${state.quizzes.length ? `<a class="text-link" href="#quiz/result">Voir mon dernier résultat →</a>` : ''}</aside></div>`;
  }
  function startQuiz(ids, count) {
    const questions = shuffle(ids).slice(0, count);
    state.activeQuiz = {items: questions.map(id => ({ id,order:shuffle([0,1,2,3]) })),answers:[],index:0,selected:null,submitted:false};
    save(); go('quiz');
  }
  function renderActiveQuiz() {
    const session = state.activeQuiz, item = session.items[session.index], q = quizMap.get(item.id);
    const correct = session.submitted && session.selected === q.correct;
    main.innerHTML = `<div class="quiz-stage">${heading('Quiz interactif','Votre session est sauvegardée. Vous pouvez revenir plus tard.')}<div class="quiz-top"><span>Question ${session.index + 1} sur ${session.items.length} · ${moduleMap.get(q.module).title}</span><button class="text-link" data-action="abandon-quiz">Quitter la session</button></div>${bar(percent(session.index,session.items.length))}<section class="card" style="margin-top:22px"><span class="eyebrow">UNE SEULE BONNE RÉPONSE</span><h2 class="quiz-question">${escape(q.question)}</h2><div class="choices" role="group" aria-label="Choix de réponse">${item.order.map((optionIndex, position) => `<button class="choice${session.selected === optionIndex ? ' selected' : ''}${session.submitted && optionIndex === q.correct ? ' correct' : ''}${session.submitted && session.selected === optionIndex && !correct ? ' wrong' : ''}" data-action="quiz-choice" data-choice="${optionIndex}" aria-pressed="${session.selected === optionIndex}"${session.submitted ? ' disabled' : ''}><span class="choice-letter">${String.fromCharCode(65+position)}</span><span>${escape(q.options[optionIndex])}${session.submitted && optionIndex === q.correct ? ' ✓ Bonne réponse' : ''}${session.submitted && session.selected === optionIndex && !correct ? ' — Votre réponse' : ''}</span></button>`).join('')}</div>${session.submitted ? `<div class="correction${correct ? '' : ' incorrect'}" role="status"><h3>${correct ? 'Bonne réponse !' : 'Un point à revoir'}</h3><p>${escape(q.explanation)}</p><a class="text-link" href="#module/${q.module}/${q.ref}">Approfondir avec la fiche →</a></div>` : ''}<div class="quiz-bottom"><span class="muted small-copy">${session.submitted ? `${session.answers.filter(a=>a.choice===quizMap.get(a.id).correct).length} bonne(s) réponse(s) pour le moment` : 'Choisissez une réponse, puis validez.'}</span>${session.submitted ? `<button class="button primary" data-action="quiz-next">${session.index === session.items.length - 1 ? 'Voir mon résultat' : 'Question suivante'} ${icon('arrow')}</button>` : `<button class="button primary" data-action="quiz-submit"${session.selected === null ? ' disabled' : ''}>Valider ma réponse</button>`}</div></section></div>`;
  }
  function renderQuizResult(index) {
    const history = state.quizzes[index === undefined ? state.quizzes.length - 1 : index];
    if (!history) return renderQuiz();
    const correct = score(history), wrong = history.answers.filter(a => quizMap.get(a.id).correct !== a.choice);
    main.innerHTML = heading('Votre bilan de quiz',`${history.answers.length} questions · session du ${formatDate(history.at)}`,`<a class="button secondary" href="#quiz">Nouveau quiz ${icon('arrow')}</a>`) +
      `<section class="card"><span class="eyebrow">RÉSULTAT DE LA SESSION</span><div class="result-score">${percent(correct,history.answers.length)} %</div><h2>${correct} / ${history.answers.length} bonnes réponses</h2><p class="muted small-copy" style="margin-top:12px">${wrong.length ? `${wrong.length} point(s) à retravailler. Relisez les explications, puis essayez de reformuler sans aide.` : 'Toutes les réponses sont correctes. Essayez maintenant de justifier les compromis à voix haute.'}</p><div class="button-row" style="margin-top:20px">${wrong.length ? `<button class="button primary" data-action="retry-errors" data-index="${index === undefined ? state.quizzes.length-1 : index}">Rejouer mes erreurs</button>` : ''}<a class="button secondary" href="#progress">Voir ma progression</a></div></section><section class="card review-section"><h2>Correction détaillée</h2>${history.answers.map(a => { const q = quizMap.get(a.id), ok = a.choice === q.correct; return `<article class="result-item"><span class="tag ${ok ? 'badge-good' : 'badge-bad'}">${ok ? 'Correct' : 'À revoir'} · ${moduleMap.get(q.module).short}</span><h3>${escape(q.question)}</h3><p>Votre réponse : ${escape(q.options[a.choice])}</p>${!ok ? `<p><strong>Bonne réponse : ${escape(q.options[q.correct])}</strong></p>` : ''}<p>${escape(q.explanation)}</p><a class="text-link" href="#module/${q.module}/${q.ref}">Relire la fiche →</a></article>`; }).join('')}</section>`;
  }
  function planDate(day) {
    const date = new Date(state.startDate + 'T12:00:00'); date.setDate(date.getDate() + day - 1); return date;
  }
  function renderPlan(dayId) {
    main.innerHTML = heading('14 jours pour vous préparer','Un parcours de 75 à 120 minutes par jour. Adaptez le rythme à votre expérience.',`<button class="button secondary small" data-action="print">Imprimer le planning</button>`) +
      `<section class="card plan-top"><div><span class="eyebrow">VOTRE RYTHME, VOTRE PARCOURS</span><h2>${state.days.length} jour${state.days.length > 1 ? 's' : ''} validé${state.days.length > 1 ? 's' : ''} sur 14</h2><p class="muted small-copy" style="margin-top:7px">Validez une journée après avoir réalisé ses exercices et son livrable.</p></div><label class="field">Date de départ<input id="plan-start" type="date" value="${state.startDate}" min="2000-01-01" max="2100-12-31"></label></section><div class="plan-grid">${plan.map(day => `<article class="day-card${state.days.includes(day.day) ? ' completed' : ''}" id="day-${day.day}"><div class="day-top"><span class="day-number"><span class="day-label">Jour</span><span class="day-big">${String(day.day).padStart(2,'0')}</span><span class="inline-date">${formatDate(planDate(day.day))}</span></span><span class="pill">${day.time}</span></div><h3>${day.title}</h3><p>${day.objective}</p><ul>${day.tasks.map(t=>`<li>${t}</li>`).join('')}<li><strong>Mise en pratique :</strong> ${day.exercise}</li></ul><div class="day-deliverable"><strong>VOTRE LIVRABLE</strong>${day.deliverable}</div><div class="button-row"><a class="text-link" href="${day.module ? `#module/${day.module}` : '#interview'}">${day.module ? 'Ouvrir le module' : 'Passer l’entretien'} →</a><button class="button ${state.days.includes(day.day) ? 'primary' : 'secondary'} small" data-action="toggle-day" data-day="${day.day}" aria-pressed="${state.days.includes(day.day)}">${icon('check')} ${state.days.includes(day.day) ? 'Journée validée' : 'Valider la journée'}</button></div></article>`).join('')}</div>`;
    if (integer(Number(dayId),1,14)) requestAnimationFrame(()=>document.getElementById(`day-${dayId}`)?.scrollIntoView({block:'start'}));
  }
  function renderInterview() {
    if (state.activeInterview) return renderActiveInterview();
    main.innerHTML = heading('Le jour J, avant le jour J','Entraînez-vous à structurer une réponse et à défendre vos décisions.') +
      `<div class="two-columns"><section class="card"><span class="eyebrow">SIMULATION GUIDÉE</span><h2>Un entretien blanc, à votre rythme</h2><p class="muted small-copy" style="margin-top:15px">Le parcours combine questions techniques, leadership et une mise en situation. Répondez à voix haute ou prenez des notes, puis révélez les attendus.</p><div class="sim-info"><div><strong>4 à 8</strong>questions variées</div><div><strong>20 à 40 min</strong>temps indicatif</div><div><strong>4 critères</strong>d’auto-évaluation</div></div><form id="interview-config"><label class="field">Format de l’entretien<select id="interview-count"><option value="4">Express · 4 questions · 20 minutes</option><option value="6" selected>Classique · 6 questions · 30 minutes</option><option value="8">Approfondi · 8 questions · 40 minutes</option></select></label><button class="button primary" style="margin-top:22px" type="submit">${icon('mic')} Commencer l’entretien</button></form><p class="result-note">Cette simulation fonctionne hors ligne. Elle ne vous écoute pas et ne note pas automatiquement vos réponses : le bilan repose sur votre auto-évaluation.</p></section><aside class="card"><h2>Répondre comme un lead</h2><ul class="mini-checklist"><li>${icon('check')}<span><strong>Clarifiez.</strong> Reformulez la question et les hypothèses.</span></li><li>${icon('check')}<span><strong>Expliquez.</strong> Donnez le mécanisme et un exemple concret.</span></li><li>${icon('check')}<span><strong>Arbitrez.</strong> Discutez les limites et les alternatives.</span></li><li>${icon('check')}<span><strong>Vérifiez.</strong> Proposez un test ou une mesure.</span></li></ul><div class="focus-box"><strong>La bonne pause</strong>Prenez quelques secondes pour structurer votre réponse. Vous pouvez suspendre le chronomètre à tout moment.</div>${state.interviews.length ? `<p style="margin-top:20px"><a class="text-link" href="#interview/result">Mon dernier bilan →</a></p>` : ''}</aside></div>`;
  }
  function startInterview(count) {
    const casePrompt = shuffle(cases)[0];
    const chosen = [];
    const lead = moduleMap.get('leadership'); chosen.push(shuffle(lead.questions)[0].id);
    const technical = shuffle(modules.filter(m => m.id !== 'leadership' && m.id !== casePrompt.module));
    for (const m of technical.slice(0,count - 2)) chosen.push(shuffle(m.questions)[0].id);
    // A leadership case leaves seven distinct technical modules available.
    const ids = [...shuffle(chosen),casePrompt.id];
    const remainingMs = count * 5 * 60000;
    state.activeInterview = { ids,index:0,notes:{},ratings:{},remainingMs,deadline:Date.now()+remainingMs,running:true,revealed:[] };
    save(); go('interview');
  }
  const criteria = [
    ['precision','Précision technique','Notions correctes, vocabulaire précis.'],
    ['reasoning','Raisonnement','Hypothèses, étapes et vérification.'],
    ['clarity','Clarté','Réponse structurée, concise et illustrée.'],
    ['tradeoffs','Compromis & recul','Limites, alternatives et contexte métier.']
  ];
  const ratingLabels = ['0 · À reprendre','1 · Partiel','2 · Solide','3 · Très solide'];
  function rated(id, ratings) { return ratingKeys.every(key => integer(ratings[id]?.[key],0,3)); }
  function remainingTime() {
    const s = state.activeInterview;
    return !s ? 0 : s.running ? Math.max(0,s.deadline-Date.now()) : s.remainingMs;
  }
  function clockText() { const secs = Math.ceil(remainingTime()/1000); return `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`; }
  function pauseInterview() {
    const s = state.activeInterview;
    if (s?.running) { s.remainingMs = remainingTime(); s.running = false; s.deadline = null; save(); }
  }
  function renderActiveInterview() {
    const s = state.activeInterview, id = s.ids[s.index], q = promptMap.get(id);
    main.innerHTML = `<div class="quiz-stage">${heading('Entretien en cours','Répondez avant d’ouvrir les attendus. Vos notes sont enregistrées.')}<div class="quiz-top"><span>Question ${s.index+1} / ${s.ids.length} · ${moduleMap.get(q.module).short}</span><div class="timer${remainingTime() === 0 ? ' expired' : ''}"><span id="interview-timer" aria-label="Temps indicatif restant">${clockText()}</span><button class="button secondary small" data-action="pause-interview"${remainingTime() === 0 ? ' disabled' : ''}>${s.running ? 'Pause' : 'Reprendre'}</button></div></div>${bar(percent(s.index,s.ids.length))}<section class="card" style="margin-top:22px"><span class="eyebrow">${q.level}</span><div class="sim-prompt"><h2>${escape(q.title)}</h2><p>${escape(q.prompt || 'Expliquez le mécanisme, proposez un exemple et précisez les limites de votre réponse.')}</p></div><label class="field">Vos notes de réponse<textarea id="interview-notes" maxlength="10000" placeholder="Hypothèses, étapes, exemple, compromis…">${escape(s.notes[id] || '')}</textarea></label><details class="sim-answer" id="sim-reference"${s.revealed.includes(id) ? ' open' : ''}><summary>Révéler les attendus et les relances</summary><div class="answer">${answerHTML(q)}</div></details><h3 style="margin-top:25px">Votre auto-évaluation</h3><p class="muted small-copy" style="margin-top:7px">Comparez votre réponse aux attendus, puis évaluez les quatre critères.</p><div class="ratings">${criteria.map(([key,label,description]) => `<label class="rating"><strong>${label}</strong>${description}<select data-rating="${key}" aria-label="${label}"><option value="">Choisir une note</option>${ratingLabels.map((text,n)=>`<option value="${n}"${s.ratings[id]?.[key]===n ? ' selected' : ''}>${text}</option>`).join('')}</select></label>`).join('')}</div><div class="quiz-bottom"><button class="text-link" data-action="abandon-interview">Arrêter sans bilan</button><button class="button primary" data-action="interview-next"${!rated(id,s.ratings) ? ' disabled' : ''}>${s.index === s.ids.length-1 ? 'Voir mon bilan' : 'Question suivante'} ${icon('arrow')}</button></div><p class="session-warning" id="timer-status" role="status">${remainingTime() === 0 ? 'Temps indicatif écoulé. Vous pouvez terminer vos réponses et votre bilan.' : s.running ? 'Le chronomètre continue pendant cette page. Quitter la page le met en pause.' : 'Chronomètre en pause. Reprenez quand vous êtes prêt.'}</p></section></div>`;
  }
  function interviewScore(h) {
    return percent(h.ids.reduce((sum,id)=>sum+ratingKeys.reduce((n,k)=>n+(h.ratings[id]?.[k] || 0),0),0),h.ids.length*12);
  }
  function renderInterviewResult(index) {
    const h = state.interviews[index === undefined ? state.interviews.length-1 : index];
    if (!h) return renderInterview();
    const averages = criteria.map(([key,label]) => ({key,label,value:h.ids.reduce((sum,id)=>sum+(h.ratings[id]?.[key] || 0),0)/h.ids.length}));
    const weak = [...averages].sort((a,b)=>a.value-b.value)[0];
    const tips = {precision:'Reprenez les mécanismes où vous avez hésité. Vérifiez un exemple concret et reformulez-le sans support.',reasoning:'Annoncez vos hypothèses, déroulez les étapes, puis proposez un test ou une mesure pour vérifier la solution.',clarity:'Utilisez une structure en trois temps : définition, exemple, limites. Répétez chaque réponse en deux minutes.',tradeoffs:'Pour chaque choix, citez une alternative et le contexte dans lequel vous la préféreriez.'};
    main.innerHTML = heading('Votre bilan d’entretien',`Auto-évaluation · ${h.ids.length} questions · ${formatDate(h.at)}`,`<a class="button secondary" href="#interview">Nouvelle simulation</a>`) +
      `<div class="two-columns"><section class="card"><span class="eyebrow">BILAN PERSONNEL</span><div class="result-score">${interviewScore(h)} %</div><h2>Votre indice d’auto-évaluation</h2><p class="result-note">Ce résultat est calculé à partir de vos notes sur quatre critères. Il n’est ni une évaluation automatique ni une prédiction de réussite à un entretien.</p><div class="progress-detail">${averages.map(a=>`<div class="coverage-row"><span>${a.label}</span><div class="progress-track"><div class="progress-fill" style="width:${percent(a.value,3)}%"></div></div><strong>${a.value.toFixed(1)} / 3</strong></div>`).join('')}</div></section><section class="card"><span class="eyebrow">PROCHAINE ACTION</span><h2>Renforcer : ${weak.label.toLowerCase()}</h2><p class="muted small-copy" style="margin:18px 0">${tips[weak.key]}</p><div class="focus-box"><strong>Votre prochaine répétition</strong>Choisissez trois réponses à reprendre. Répondez à nouveau avant de relire le corrigé, puis cherchez une amélioration observable.</div><a class="button primary" style="margin-top:22px" href="#modules">Reprendre les fiches</a></section></div><section class="card review-section"><h2>Questions, notes et attendus</h2>${h.ids.map(id=> { const q=promptMap.get(id); return `<article class="result-item"><span class="tag badge-good">${moduleMap.get(q.module).short}</span><h3>${escape(q.title)}</h3><p style="white-space:pre-wrap">${escape(h.notes[id] || 'Aucune note écrite pour cette réponse.')}</p><p>${criteria.map(([key,label])=>`${label} : ${h.ratings[id]?.[key] ?? '—'}/3`).join(' · ')}</p><details class="sim-answer"><summary>Revoir les attendus</summary><div class="answer">${answerHTML(q)}</div></details></article>`; }).join('')}</section>`;
  }
  function renderProgress() {
    const moduleStats = modules.map(m => { const answers=state.quizzes.flatMap(h=>h.answers).filter(a=>quizMap.get(a.id).module===m.id); return { m,answers,rate:answers.length?percent(answers.filter(a=>a.choice===quizMap.get(a.id).correct).length,answers.length):null }; });
    const weak = moduleStats.filter(s=>s.rate!==null).sort((a,b)=>a.rate-b.rate).slice(0,3);
    const totalAnswers=state.quizzes.reduce((sum,h)=>sum+h.answers.length,0);
    main.innerHTML = heading('Vos progrès, concrètement','La maîtrise déclarée et les résultats des quiz sont suivis séparément.',`<a class="button secondary small" href="#settings">${icon('download')} Sauvegarder</a>`) +
      `<div class="stats-grid"><div class="stat-card"><div class="stat-icon">${icon('book')}</div><div><div class="stat-number">${percent(state.mastered.length,allQuestions.length)}<small> %</small></div><div class="stat-label">des fiches maîtrisées</div></div></div><div class="stat-card"><div class="stat-icon">${icon('quiz')}</div><div><div class="stat-number">${state.quizzes.length}</div><div class="stat-label">quiz terminés</div></div></div><div class="stat-card"><div class="stat-icon">${icon('target')}</div><div><div class="stat-number">${overallQuiz() === null ? '—' : `${overallQuiz()}<small> %</small>`}</div><div class="stat-label">sur ${totalAnswers} réponses</div></div></div><div class="stat-card"><div class="stat-icon">${icon('mic')}</div><div><div class="stat-number">${state.interviews.length}</div><div class="stat-label">entretiens terminés</div></div></div></div>
      <div class="two-columns"><section class="card"><h2>Couverture des modules</h2><p class="muted small-copy" style="margin-top:8px">Fiches que vous avez marquées comme maîtrisées.</p>${modules.map(m=>`<div class="coverage-row"><a href="#module/${m.id}">${m.short}</a>${bar(percent(masteredCount(m),m.questions.length))}<strong>${masteredCount(m)} / ${m.questions.length}</strong></div>`).join('')}<div class="chart-legend"><span><i class="dot"></i>Maîtrise déclarée</span><a href="#modules" data-show-favorites="true">${state.favorites.length} favoris</a></div></section><section class="card"><h2>Où concentrer vos efforts ?</h2>${weak.length ? `<p class="muted small-copy" style="margin:12px 0">Modules testés, du taux de réussite le plus bas au plus élevé.</p>${weak.map(s=>`<div class="result-item"><div class="section-heading"><h3>${s.m.title}</h3><span class="pill">${s.rate} % · ${s.answers.length} réponses</span></div><a class="text-link" href="#module/${s.m.id}">Revoir les fiches →</a></div>`).join('')}` : `<div class="empty-state" style="margin-top:18px"><h3>Votre premier repère</h3><p>Terminez un quiz pour identifier les notions à retravailler.</p><a class="button primary" href="#quiz">Faire un quiz</a></div>`}<p class="result-note">Les modules non testés ne sont pas considérés comme acquis. Les réponses répétées sont incluses dans le taux.</p></section></div>
      <div class="two-columns review-section"><section class="card"><h2>Historique des quiz</h2>${state.quizzes.length ? `<ul class="history-list">${state.quizzes.map((h,i)=>({h,i})).reverse().slice(0,15).map(({h,i})=>`<li><a href="#quiz/result/${i}">${formatDate(h.at)} · ${h.answers.length} questions</a><strong>${score(h)} / ${h.answers.length}</strong></li>`).join('')}</ul>` : `<p class="muted small-copy" style="margin-top:16px">Vos sessions terminées apparaîtront ici.</p>`}</section><section class="card"><h2>Historique des entretiens</h2>${state.interviews.length ? `<ul class="history-list">${state.interviews.map((h,i)=>({h,i})).reverse().slice(0,15).map(({h,i})=>`<li><a href="#interview/result/${i}">${formatDate(h.at)} · ${h.ids.length} questions</a><strong>${interviewScore(h)} % · auto-éval.</strong></li>`).join('')}</ul>` : `<p class="muted small-copy" style="margin-top:16px">Les bilans d’auto-évaluation seront conservés ici.</p>`}</section></div>`;
  }
  function renderSettings() {
    main.innerHTML = heading('Vos données vous appartiennent','Progression, favoris, notes et résultats restent dans votre navigateur.') +
      `<div class="two-columns"><section class="card"><span class="eyebrow">SAUVEGARDE PERSONNELLE</span><h2>Emportez votre progression</h2><p class="muted small-copy" style="margin-top:15px">Exportez un fichier JSON pour conserver une copie ou transférer vos données vers un autre navigateur. L’import remplace les données présentes après confirmation.</p><div class="data-actions"><button class="button primary" data-action="export">${icon('download')} Exporter ma progression</button><label class="field">Importer une sauvegarde JSON<input id="import-file" type="file" accept=".json,application/json"></label></div><div class="notice">${storageAvailable ? 'Sauvegarde locale disponible dans ce navigateur.' : 'Sauvegarde locale indisponible : pensez à exporter avant de fermer.'}</div><p class="result-note">Les 100 derniers quiz et les 50 derniers entretiens sont conservés. Vos notes et fiches restent enregistrées.</p></section><section class="card"><h2>Utiliser le site hors ligne</h2><p class="muted small-copy" style="margin-top:15px">Extrayez tout le ZIP, puis ouvrez <strong>index.html</strong> dans un navigateur moderne. Gardez les fichiers CSS et JavaScript à côté du fichier HTML.</p><p class="muted small-copy" style="margin-top:15px">La sauvegarde est propre à ce navigateur et à l’adresse utilisée. Une ouverture locale, un aperçu HTTP ou un autre emplacement peuvent avoir des données différentes. Exportez avant de déplacer le dossier ou de nettoyer les données du navigateur.</p><p class="muted small-copy" style="margin-top:15px">Toutes les fiches et interactions fonctionnent sans Internet. Seuls les liens documentaires de la page Références nécessitent une connexion.</p><div class="notice">Aucun compte, suivi publicitaire, service distant ni dépendance serveur.</div></section></div><section class="card review-section"><h2>Repartir de zéro</h2><p class="muted small-copy" style="margin:12px 0 20px">Supprime les données de LeadLab dans ce navigateur : progression, notes, favoris, sessions et historique. Une sauvegarde exportée permet de les réimporter.</p><button class="button danger" data-action="reset">Réinitialiser mes données</button></section>`;
  }
  function renderSources() {
    main.innerHTML = heading('Références & méthode','Une base de préparation pour comprendre et expliquer les mécanismes.') +
      `<section class="card intro-copy"><h2>Comment utiliser cet atelier</h2><p class="small-copy">Les fiches sont des synthèses pédagogiques originales. Avant d’ouvrir une réponse, prenez deux minutes pour formuler votre explication. Comparez ensuite mécanisme, exemple, pièges et compromis. Utilisez vos expériences réelles pour les questions de leadership.</p><p class="small-copy">Les exemples sont ciblés : ils n’incluent pas tous les imports, types, dépendances ou contrôles d’une application complète. Le socle vise Java 17+ ; les threads virtuels sont signalés Java 21+. Les exemples Spring utilisent les approches modernes SecurityFilterChain, Jakarta et injection constructeur. Vérifiez les détails d’API pour les versions de votre projet.</p><p class="small-copy">Le planning propose une sélection ciblée et des exercices à réaliser dans votre environnement ou sur papier. Les modules permettent d’approfondir à votre rythme. Le site ne compile pas de code. Les entretiens blancs proposent des attendus et une auto-évaluation, sans analyse automatique de vos réponses.</p><div class="notice">Le contenu embarqué reste accessible hors ligne. Les références ci-dessous ouvrent la documentation en ligne.</div><h2>Pour approfondir à la source</h2><ul class="source-list">${sources.map(s=>`<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.name} ↗</a></li>`).join('')}</ul><p class="result-note">Édition du 13 octobre 2026 · ${modules.length} modules · ${allQuestions.length} fiches · ${allQuizzes.length} questions de quiz · 4 cas pratiques.</p></section>`;
  }
  function renderNotFound() { main.innerHTML = `<div class="empty-state"><h1>Cette page n’existe pas</h1><p>Retrouvez votre préparation depuis le tableau de bord.</p><a class="button primary" href="#dashboard">Retour à l’accueil</a></div>`; }
  let previousRoute = '';
  function render() {
    const route = (location.hash.slice(1) || 'dashboard').split('/');
    const page = route[0];
    if (page !== 'interview' || route[1] === 'result') pauseInterview();
    const active = page === 'module' ? 'modules' : page;
    document.getElementById('navigation').innerHTML = navItems.map(([id,symbol,title])=>`<a class="nav-link${id===active ? ' active' : ''}" href="#${id}"${id===active ? ' aria-current="page"' : ''}>${icon(symbol)}${title}</a>`).join('');
    document.getElementById('page-label').textContent = navItems.find(n=>n[0]===active)?.[2] || extraPages[active] || 'Références';
    const changed = previousRoute !== location.hash;
    previousRoute = location.hash;
    if (page==='dashboard') renderDashboard();
    else if (page==='modules') renderModules();
    else if (page==='module') renderModule(route[1],route[2]);
    else if (page==='quiz') route[1]==='result' ? renderQuizResult(route[2]===undefined?undefined:Number(route[2])) : renderQuiz(route[1]);
    else if (page==='plan') renderPlan(route[1]);
    else if (page==='interview') route[1]==='result' ? renderInterviewResult(route[2]===undefined?undefined:Number(route[2])) : renderInterview();
    else if (page==='progress') renderProgress();
    else if (page==='settings') renderSettings();
    else if (page==='sources') renderSources();
    else renderNotFound();
    if (changed) { window.scrollTo(0,0); main.focus({preventScroll:true}); }
    document.title = `${document.getElementById('page-label').textContent} — LeadLab`;
  }
  function go(route) { if(location.hash === '#'+route) render(); else location.hash=route; }
  function toggleItem(list,value) { return list.includes(value) ? list.filter(v=>v!==value) : [...list,value]; }
  function updateQuestionCard(id) {
    const details = document.getElementById(`question-${id}`);
    if (!details) return;
    const open = details.open;
    const notesOpen = details.querySelector('.notes')?.open;
    const activeAction = document.activeElement?.dataset.action;
    details.outerHTML = questionHTML(questionMap.get(id),open);
    const replacement = document.getElementById(`question-${id}`);
    if (notesOpen) replacement.querySelector('.notes').open = true;
    if (activeAction) replacement.querySelector(`[data-action="${activeAction}"]`)?.focus({preventScroll:true});
    // Keep the module-level count in sync without closing the open response.
    const banner = document.querySelector('.module-banner h2');
    const module = moduleMap.get(questionMap.get(id).module);
    if (banner) banner.textContent = `${masteredCount(module)} / ${module.questions.length} questions maîtrisées`;
    if (document.getElementById('results-count') && isBrowsing()) {
      const visible = filterQuestions();
      if (!visible.some(q=>q.id===id)) updateLibraryResults();
    }
    if (document.getElementById('module-questions') && moduleView.status !== 'all') {
      const m = moduleMap.get(moduleView.id);
      if (m && !m.questions.some(q => q.id === id && (moduleView.status === 'todo') === !state.mastered.includes(q.id))) updateModuleList();
    }
  }
  document.addEventListener('click', async event => {
    if (event.target.closest('.skip-link')) { event.preventDefault(); main.focus(); main.scrollIntoView({block:'start'}); return; }
    if (event.target.closest('[data-show-favorites]')) libraryFilter.status='favorites';
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action==='master' || action==='favorite') {
      const key = action==='master' ? 'mastered' : 'favorites';
      state[key]=toggleItem(state[key],button.dataset.id); save(); updateQuestionCard(button.dataset.id);
      toast(action==='master' ? 'Progression mise à jour.' : 'Favoris mis à jour.');
    } else if (action==='clear-filters') { libraryFilter={module:'all',status:'all',level:'all',search:'',all:false}; libraryVisibleCount=25; renderModules(); window.scrollTo(0,0); }
    else if (action==='show-all') { libraryFilter.all=true; libraryVisibleCount=25; updateLibraryResults(); document.getElementById('question-results')?.scrollIntoView({block:'start'}); }
    else if (action==='load-more') { const next=filterQuestions()[libraryVisibleCount]?.id; libraryVisibleCount+=25; updateLibraryResults(); document.querySelector(`#question-${next} summary`)?.focus({preventScroll:false}); }
    else if (action==='quiz-choice') { state.activeQuiz.selected=Number(button.dataset.choice); save(); renderActiveQuiz(); document.querySelector(`[data-choice="${button.dataset.choice}"]`)?.focus({preventScroll:true}); }
    else if (action==='quiz-submit') {
      const s=state.activeQuiz;
      if (!s || s.submitted || s.selected===null) return;
      s.answers.push({id:s.items[s.index].id,choice:s.selected}); s.submitted=true; save(); renderActiveQuiz(); document.querySelector('[data-action="quiz-next"]')?.focus({preventScroll:true});
    } else if (action==='quiz-next') {
      const s=state.activeQuiz; if(!s?.submitted) return;
      if(s.index===s.items.length-1) { state.quizzes.push({at:new Date().toISOString(),answers:s.answers});state.quizzes=state.quizzes.slice(-100);state.activeQuiz=null;save();go('quiz/result'); }
      else { s.index++;s.selected=null;s.submitted=false;save();renderActiveQuiz();main.focus({preventScroll:true});window.scrollTo(0,0); }
    } else if(action==='abandon-quiz') {
      if(await confirmAction('Quitter ce quiz ?','La session en cours sera supprimée. Les quiz déjà terminés seront conservés.')) {state.activeQuiz=null;save();go('quiz');}
    } else if(action==='retry-errors') {
      const h=state.quizzes[Number(button.dataset.index)];
      if(state.activeQuiz && !await confirmAction('Remplacer le quiz en cours ?','Votre session en cours sera remplacée par les erreurs de ce quiz.')) return;
      const ids=h.answers.filter(a=>quizMap.get(a.id).correct!==a.choice).map(a=>a.id);startQuiz(ids,ids.length);
    } else if(action==='toggle-day') {
      const y=window.scrollY;state.days=toggleItem(state.days,Number(button.dataset.day));save();renderPlan();window.scrollTo(0,y);document.querySelector(`[data-day="${button.dataset.day}"]`)?.focus({preventScroll:true});toast('Planning mis à jour.');
    } else if(action==='print') window.print();
    else if(action==='pause-interview') {
      const s=state.activeInterview;
      if(s.running) pauseInterview(); else {s.running=true;s.deadline=Date.now()+s.remainingMs;save();}
      renderActiveInterview();document.querySelector('[data-action="pause-interview"]')?.focus({preventScroll:true});
    } else if(action==='interview-next') {
      const s=state.activeInterview;const id=s.ids[s.index];if(!rated(id,s.ratings)) return;
      if(s.index===s.ids.length-1) {pauseInterview();state.interviews.push({at:new Date().toISOString(),ids:s.ids,notes:s.notes,ratings:s.ratings});state.interviews=state.interviews.slice(-50);state.activeInterview=null;save();go('interview/result');}
      else {s.index++;save();renderActiveInterview();window.scrollTo(0,0);main.focus({preventScroll:true});}
    } else if(action==='abandon-interview') {
      pauseInterview();
      if(await confirmAction('Arrêter cet entretien ?','Les notes et évaluations de cette session seront supprimées. Les bilans précédents seront conservés.')) {state.activeInterview=null;save();go('interview');} else renderActiveInterview();
    } else if(action==='export') exportProgress();
    else if(action==='reset') {
      if(await confirmAction('Réinitialiser toutes vos données ?','Cette action efface votre progression, vos notes, vos favoris et vos historiques LeadLab dans ce navigateur. Exportez une sauvegarde avant si vous souhaitez les récupérer.')) {state=blankState();save();render();toast('Données réinitialisées.');}
    }
  });
  document.addEventListener('submit', event => {
    if(event.target.id==='quiz-config') {event.preventDefault();const selected=document.getElementById('quiz-module').value;const raw=document.getElementById('quiz-count').value;startQuiz(allQuizzes.filter(q=>selected==='all'||q.module===selected).map(q=>q.id),raw==='all'?Infinity:Number(raw));}
    if(event.target.id==='interview-config') {event.preventDefault();startInterview(Number(document.getElementById('interview-count').value));}
  });
  document.addEventListener('input', event => {
    const el=event.target;
    if(el.id==='search-questions') {libraryFilter.search=el.value;libraryVisibleCount=25;updateLibraryResults();}
    if(el.dataset.note) {state.notes[el.dataset.note]=el.value;save();}
    if(el.id==='interview-notes' && state.activeInterview) {const s=state.activeInterview;s.notes[s.ids[s.index]]=el.value;save();}
  });
  document.addEventListener('change', async event => {
    const el=event.target;
    if(el.id==='module-filter') {libraryFilter.module=el.value;libraryVisibleCount=25;updateLibraryResults();}
    if(el.id==='status-filter') {libraryFilter.status=el.value;libraryVisibleCount=25;updateLibraryResults();}
    if(el.id==='level-filter') {libraryFilter.level=el.value;libraryVisibleCount=25;updateLibraryResults();}
    if(el.id==='module-level-filter') {moduleView.level=el.value;updateModuleList();}
    if(el.id==='module-status-filter') {moduleView.status=el.value;updateModuleList();}
    if(el.id==='quiz-module') document.getElementById('quiz-pool-info').textContent=`${el.value==='all'?allQuizzes.length:moduleMap.get(el.value).quizzes.length} questions disponibles. La session s’adapte à la taille du module.`;
    if(el.id==='plan-start') {if(validDate(el.value)&&el.validity.valid) {state.startDate=el.value;save();renderPlan();toast('Dates du planning mises à jour.');}else {el.value=state.startDate;toast('Choisissez une date valide.');}}
    if(el.dataset.rating && state.activeInterview) {const s=state.activeInterview,id=s.ids[s.index];s.ratings[id] ||= {};if(el.value==='') delete s.ratings[id][el.dataset.rating];else s.ratings[id][el.dataset.rating]=Number(el.value);save();document.querySelector('[data-action="interview-next"]').disabled=!rated(id,s.ratings);}
    if(el.id==='import-file') {
      const file=el.files[0];if(!file) return;
      try {
        if(file.size>8000000) throw new Error('Fichier trop volumineux (maximum 8 Mo).');
        const parsed=JSON.parse(await file.text());
        if(parsed.app!=='LeadLab' || !parsed.state) throw new Error('Ce fichier n’est pas une sauvegarde LeadLab.');
        const next=normalize(parsed.state);
        if(await confirmAction('Importer cette sauvegarde ?',`${next.mastered.length} fiches maîtrisées, ${next.quizzes.length} quiz et ${next.interviews.length} entretiens. L’import remplacera les données actuelles.`)) {state=next;save();render();toast('Progression importée.');}
      } catch(error) {toast(error instanceof SyntaxError ? 'Le fichier JSON est invalide.' : error.message);}
      if(el.isConnected) el.value='';
    }
  });
  document.addEventListener('toggle', event => {
    if(event.target.id==='sim-reference' && event.target.open && state.activeInterview) {
      const s=state.activeInterview;s.revealed=unique([...s.revealed,s.ids[s.index]]);save();
    }
  },true);
  function exportProgress() {
    const blob=new Blob([JSON.stringify({app:'LeadLab',exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`leadlab-progression-${dateKey()}.json`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Sauvegarde exportée.');
  }
  setInterval(()=>{
    const timer=document.getElementById('interview-timer');
    if(!timer||!state.activeInterview?.running) return;
    timer.textContent=clockText();
    if(remainingTime()===0) {pauseInterview();renderActiveInterview();toast('Temps indicatif écoulé. Vous pouvez terminer votre réponse.');}
  },1000);
  window.addEventListener('pagehide',pauseInterview);
  window.addEventListener('hashchange',render);
  render();
  if(startupMessage) toast(startupMessage);
})();
