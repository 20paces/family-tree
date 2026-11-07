const state = { view: 'tree', user: 'admin@example.test', dev: false, tree: null, uploads: [], edits: [], members: [], audit: [] };
const main = document.getElementById('main');
const status = document.getElementById('status');

function say(text) { status.textContent = text || ''; }

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.dev) headers.set('X-Dev-User', state.user);
  if (options.method && options.method !== 'GET') headers.set('X-Family-Tree-Request', '1');
  if (options.json) {
    headers.set('content-type', 'application/json');
    options.body = JSON.stringify(options.json);
  }
  const response = await fetch(path, { method: options.method || 'GET', headers, body: options.body });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error((body && body.error) || ('request_failed_' + response.status));
  return body;
}

function kindLabel(kind) {
  return {
    parent_biological: 'Biological parent',
    parent_adoptive: 'Adoptive parent',
    parent_step: 'Step parent',
    partner: 'Partner',
    partner_former: 'Former partner'
  }[kind] || kind;
}

function personName(id) {
  const person = (state.tree && state.tree.people || []).find(item => item.id === id);
  return person ? person.displayName : ('Person ' + id);
}

function personOptions() {
  return ((state.tree && state.tree.people) || [])
    .map(person => '<option value="' + person.id + '">' + esc(person.displayName) + '</option>')
    .join('');
}

function renderTree() {
  const people = (state.tree && state.tree.people) || [];
  const rels = (state.tree && state.tree.relationships) || [];
  main.innerHTML = '<section class="panel"><h2>Approved tree</h2><p class="meta">Only published people, relationships, and approved documents are shown. Drafts stay off this list. The Tree tab opens the same all-branch chart.</p><div class="grid" id="people"></div></section>';
  const grid = document.getElementById('people');
  people.forEach(person => {
    const links = rels.filter(row => row.fromId === person.id || row.toId === person.id);
    const card = document.createElement('article');
    card.className = 'card';
    const docs = (person.documents || []).map(doc => '<span class="kind">' + esc(doc.caption || doc.filename) + '</span>').join('');
    const halves = (person.halfSiblings || []).map(item => esc(personName(item.personId))).join(', ') || 'None recorded';
    card.innerHTML = '<h2>' + esc(person.displayName) + '</h2><p class="meta">' + esc(person.born || '?') + '–' + esc(person.died || '') + '</p><p>' + esc(person.notes || '') + '</p>' +
      links.map(row => '<span class="kind">' + esc(kindLabel(row.kind)) + '</span>').join('') +
      '<p class="meta">Half-siblings: ' + halves + '</p>' + docs;
    grid.appendChild(card);
  });
}

function renderInbox() {
  main.innerHTML = '<div class="layout"><section class="panel"><h2>Private upload</h2><p class="meta">JPEG, PNG, WebP, and PDF only. Files stay pending until an administrator approves them. Viewers cannot open them before that.</p><form id="up"><label>File<input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><label>Caption<input name="caption" required maxlength="500"></label><label>Date<input name="date" placeholder="1946"></label><label>People, comma separated ids<input name="people" placeholder="1,2"></label><button class="primary" type="submit">Submit for review</button></form></section><section class="panel"><h2>Your files</h2><div class="list" id="files"></div></section></div>';
  const list = document.getElementById('files');
  state.uploads.forEach(item => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = '<div><strong>' + esc(item.filename) + '</strong><div class="meta">' + esc(item.status) + (item.caption ? ' · ' + esc(item.caption) : '') + '</div></div>';
    list.appendChild(row);
  });
  if (!state.uploads.length) list.innerHTML = '<p class="meta">No files yet.</p>';
  document.getElementById('up').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.target);
    const file = data.get('file');
    try {
      await api('/api/uploads', {
        method: 'POST',
        body: file,
        headers: {
          'content-type': file.type,
          'x-filename': file.name,
          'x-caption': data.get('caption'),
          'x-doc-date': data.get('date'),
          'x-people': data.get('people')
        }
      });
      say('Upload submitted for review.');
      await load();
    } catch (error) { say(error.message); }
  });
}

function editLabel(edit) {
  let extra = '';
  try {
    const payload = JSON.parse(edit.payload);
    if (payload.displayName) extra = ': ' + payload.displayName;
    else if (payload.kind) extra = ': ' + kindLabel(payload.kind);
  } catch { extra = ''; }
  return edit.proposal_type + extra;
}

function renderEditor() {
  const options = personOptions();
  main.innerHTML = '<div class="layout"><section class="panel"><h2>Propose a person</h2><form id="person"><label>Name<input name="displayName" required maxlength="120"></label><label>Sex<select name="sex"><option value="f">Female</option><option value="m">Male</option><option value="">Unrecorded</option></select></label><label>Born<input name="born" inputmode="numeric"></label><label>Notes<textarea name="notes"></textarea></label><button class="primary" type="submit">Submit person</button><button class="quiet" type="submit" data-draft="1">Save draft</button></form><h2>Update a person</h2><form id="update"><label>Person<select name="personId">' + options + '</select></label><label>Notes<textarea name="notes"></textarea></label><button class="primary" type="submit">Submit update</button><button class="quiet" type="submit" data-draft="1">Save draft</button></form></section><section class="panel"><h2>Propose a relationship</h2><p class="meta">Biological parents can form the couple chart. Adoptive, step, and former-partner links stay labeled and off that line. A draft is hidden from viewers and from the review queue.</p><form id="rel"><label>From<select name="fromId">' + options + '</select></label><label>To<select name="toId">' + options + '</select></label><label>Kind<select name="kind"><option value="parent_biological">Biological parent</option><option value="parent_adoptive">Adoptive parent</option><option value="parent_step">Step parent</option><option value="partner">Partner</option><option value="partner_former">Former partner</option></select></label><button class="primary" type="submit">Submit relationship</button><button class="quiet" type="submit" data-draft="1">Save draft</button></form><div class="list" id="edits"></div></section></div>';
  const edits = document.getElementById('edits');
  state.edits.forEach(edit => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = '<div><strong>' + esc(editLabel(edit)) + '</strong><div class="meta">' + esc(edit.status) + '</div></div>';
    edits.appendChild(row);
  });
  if (!state.edits.length) edits.innerHTML = '<p class="meta">No proposals yet.</p>';
  const updateForm = document.getElementById('update');
  const fillNotes = () => {
    const person = ((state.tree && state.tree.people) || []).find(item => String(item.id) === updateForm.personId.value);
    updateForm.notes.value = person ? (person.notes || '') : '';
  };
  updateForm.personId.addEventListener('change', fillNotes);
  fillNotes();
  document.getElementById('person').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    const draft = event.submitter && event.submitter.dataset.draft === '1';
    try {
      await api('/api/edits', { method: 'POST', json: { type: 'create_person', displayName: data.displayName, sex: data.sex, born: data.born ? Number(data.born) : null, notes: data.notes, submit: !draft } });
      say(draft ? 'Draft saved. It is hidden from the tree and the review queue.' : 'Person submitted for review.');
      await load();
    } catch (error) { say(error.message); }
  });
  updateForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    const person = ((state.tree && state.tree.people) || []).find(item => String(item.id) === String(data.personId));
    if (!person) { say('Choose a published person.'); return; }
    const draft = event.submitter && event.submitter.dataset.draft === '1';
    try {
      await api('/api/edits', {
        method: 'POST',
        json: {
          type: 'update_person',
          personId: person.id,
          baseVersion: person.version,
          displayName: person.displayName,
          sex: person.sex,
          born: person.born,
          died: person.died,
          notes: data.notes,
          submit: !draft
        }
      });
      say(draft ? 'Draft saved. The published note is unchanged.' : 'Update submitted for review.');
      await load();
    } catch (error) { say(error.message); }
  });
  document.getElementById('rel').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    const draft = event.submitter && event.submitter.dataset.draft === '1';
    try {
      await api('/api/edits', { method: 'POST', json: { type: 'create_relationship', fromId: Number(data.fromId), toId: Number(data.toId), kind: data.kind, submit: !draft } });
      say(draft ? 'Relationship draft saved.' : 'Relationship submitted for review.');
      await load();
    } catch (error) { say(error.message); }
  });
}

function renderAdmin() {
  main.innerHTML = '<div class="layout"><section class="panel"><h2>Waiting for review</h2><p class="meta">Pending uploads and edits only. Drafts are not in this queue and are not on the viewer tree.</p><div id="queue" class="list"></div><h2>Members</h2><form id="member" class="row"><input name="email" type="email" placeholder="person@example.test" required><select name="role"><option value="viewer">Viewer</option><option value="contributor">Contributor</option><option value="admin">Admin</option></select><button class="primary" type="submit">Add</button></form><div id="members" class="list"></div></section><section class="panel"><h2>Audit</h2><div id="audit" class="list"></div></section></div>';
  const queue = document.getElementById('queue');
  state.uploads.filter(item => item.status === 'pending').forEach(item => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = '<div><strong>' + esc(item.filename) + '</strong><div class="meta">' + esc(item.owner_email) + ' · ' + esc(item.caption || 'no caption') + '</div></div>';
    const button = document.createElement('button');
    button.className = 'primary';
    button.type = 'button';
    button.textContent = 'Approve';
    button.addEventListener('click', async () => {
      try { await api('/api/uploads/' + item.id + '/approve', { method: 'POST' }); say('Upload approved.'); await load(); }
      catch (error) { say(error.message); }
    });
    row.appendChild(button);
    queue.appendChild(row);
  });
  state.edits.filter(item => item.status === 'pending').forEach(item => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = '<div><strong>' + esc(editLabel(item)) + '</strong><div class="meta">' + esc(item.author_email) + '</div></div>';
    const button = document.createElement('button');
    button.className = 'quiet';
    button.type = 'button';
    button.textContent = 'Approve edit';
    button.addEventListener('click', async () => {
      try { await api('/api/edits/' + item.id + '/approve', { method: 'POST' }); say('Edit approved.'); await load(); }
      catch (error) { say(error.message); }
    });
    row.appendChild(button);
    queue.appendChild(row);
  });
  if (!queue.children.length) queue.innerHTML = '<p class="meta">Nothing is waiting.</p>';
  const members = document.getElementById('members');
  state.members.forEach(member => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = '<div><strong>' + esc(member.email) + '</strong><div class="meta">' + esc(member.role) + ' · ' + esc(member.status) + '</div></div>';
    if (member.status === 'active' && member.email !== state.user) {
      const button = document.createElement('button');
      button.className = 'quiet';
      button.type = 'button';
      button.textContent = 'Revoke';
      button.addEventListener('click', async () => {
        try { await api('/api/admin/members/' + member.id, { method: 'PATCH', json: { status: 'revoked' } }); say('Membership revoked.'); await load(); }
        catch (error) { say(error.message); }
      });
      row.appendChild(button);
    }
    members.appendChild(row);
  });
  document.getElementById('member').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    try { await api('/api/admin/members', { method: 'POST', json: data }); say('Member added.'); await load(); }
    catch (error) { say(error.message); }
  });
  const audit = document.getElementById('audit');
  state.audit.slice(0, 12).forEach(entry => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = '<div><strong>' + esc(entry.action) + '</strong><div class="meta">' + esc(entry.actor_email) + ' · ' + esc(entry.at) + '</div></div>';
    audit.appendChild(row);
  });
  if (!state.audit.length) audit.innerHTML = '<p class="meta">No audit entries yet.</p>';
}

async function load() {
  say('');
  try {
    state.tree = await api('/api/tree');
  } catch (error) {
    state.tree = { people: [], relationships: [] };
    say(error.message === 'forbidden' ? 'This identity cannot view the record.' : error.message);
  }
  state.uploads = [];
  state.edits = [];
  state.members = [];
  state.audit = [];
  if (state.user !== 'viewer@example.test' && state.user !== 'revoked@example.test') {
    try { state.uploads = (await api('/api/uploads')).uploads; } catch { state.uploads = []; }
    try { state.edits = (await api('/api/edits')).edits; } catch { state.edits = []; }
  }
  if (state.user === 'admin@example.test') {
    try { state.members = (await api('/api/admin/members')).members; } catch { state.members = []; }
    try { state.audit = (await api('/api/audit')).audit; } catch { state.audit = []; }
  }
  if (state.view === 'inbox') renderInbox();
  else if (state.view === 'editor') renderEditor();
  else if (state.view === 'admin') renderAdmin();
  else renderTree();
}

document.querySelectorAll('.tabs button').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.view === 'tree') {
      sessionStorage.setItem('ft-dev-user', state.user);
      location.href = '/canvas/?data=approved&as=' + encodeURIComponent(state.user);
      return;
    }
    document.querySelectorAll('.tabs button').forEach(item => item.classList.remove('on'));
    button.classList.add('on');
    state.view = button.dataset.view;
    load();
  });
});

document.getElementById('who').addEventListener('change', event => {
  state.user = event.target.value;
  load();
});

api('/api/config').then(config => {
  state.dev = !!config.devIdentity;
  document.getElementById('devbar').hidden = !state.dev;
  if (!state.dev) state.user = '';
  return load();
}).catch(error => say(error.message));
