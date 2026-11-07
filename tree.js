// Family tree model, relationship helpers, and layout.
// People 1–14 are the original practice family. Their names, dates, notes,
// spouses, documents, and existing parent links are unchanged. Parents were
// filled in only where the chart previously had none. Everyone else is a
// fictional sample relative, labelled in the notes and with sample: true.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FamilyTree = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BRANCHES = {
    ashworth: { key: 'ashworth', name: 'Ashworth', kind: 'paternal', label: 'Ashworth · paternal', color: '#8a5a3c' },
    hale: { key: 'hale', name: 'Hale', kind: 'maternal', label: 'Hale · maternal', color: '#2c6e91' },
    doyle: { key: 'doyle', name: 'Doyle', kind: 'maternal', label: 'Doyle · maternal', color: '#2f7d62' },
    pryce: { key: 'pryce', name: 'Pryce', kind: 'partner', label: 'Pryce · partner', color: '#6a568f' },
    iyer: { key: 'iyer', name: 'Iyer', kind: 'partner', label: 'Iyer · partner', color: '#a14e78' },
    chen: { key: 'chen', name: 'Chen', kind: 'partner', label: 'Chen · partner', color: '#b86a2a' }
  };

  const SECTION_COPY = [
    { branch: 'ashworth', blurb: 'Paternal Ashworth line, from Arthur and Mabel through Walter, Harold, and Daniel. Spouses from other branches stay attached to the person they married.' },
    { branch: 'hale', blurb: 'Maternal Hale family of Edith, wife of Walter Ashworth. Both of Edith’s parents are in this branch, so her children’s maternal side can be opened.' },
    { branch: 'doyle', blurb: 'Maternal Doyle family of Margaret, wife of Harold. This is the mother’s family of Daniel and Claire.' },
    { branch: 'pryce', blurb: 'Partner family of Robert Pryce, husband of Joan Ashworth, including Robert’s parents and their son Thomas.' },
    { branch: 'iyer', blurb: 'Partner family of Priya, wife of Daniel. Maternal line of Oliver and Isla — both of Priya’s parents are shown.' },
    { branch: 'chen', blurb: 'Partner family of Mei, wife of Thomas Pryce. Maternal line of Leo — both of Mei’s parents are shown.' }
  ];

  const SAMPLE = 'Fictional sample relative — not a real person. ';

  let people = [
    { id: 1, name: 'Walter Ashworth', sex: 'm', born: 1921, died: 1994, parents: [15, 16], spouse: 2, branch: 'ashworth', note: 'Carpenter from Ballarat.', docs: [{ title: 'Birth certificate', file: 'docs/birth-walter-1921.svg' }, { title: 'Marriage certificate', file: 'docs/marriage-walter-edith-1946.svg' }, { title: 'Will (PDF)', file: 'docs/will-walter-1990.pdf' }] },
    { id: 2, name: 'Edith Ashworth (née Hale)', sex: 'f', born: 1924, died: 2009, parents: [18, 19], spouse: 1, branch: 'hale', note: 'Schoolteacher and keen gardener.', docs: [{ title: 'Birth certificate', file: 'docs/birth-edith-1924.svg' }, { title: 'Family photo, c.1950', file: 'docs/photo-ashworths-1950.svg' }, { title: 'Recipe book (PDF)', file: 'docs/recipes-edith.pdf' }] },
    { id: 3, name: 'Harold Ashworth', sex: 'm', born: 1948, died: 2015, parents: [1, 2], spouse: 4, branch: 'ashworth', note: 'Eldest son; ran the family hardware shop.', docs: [{ title: 'Birth certificate', file: 'docs/birth-harold-1948.svg' }, { title: 'Marriage certificate', file: 'docs/marriage-harold-margaret-1973.svg' }, { title: 'Obituary (PDF)', file: 'docs/obituary-harold-2015.pdf' }] },
    { id: 4, name: 'Margaret Ashworth (née Doyle)', sex: 'f', born: 1950, died: null, parents: [21, 22], spouse: 3, branch: 'doyle', note: 'Retired nurse.', docs: [{ title: 'Marriage certificate', file: 'docs/marriage-harold-margaret-1973.svg' }] },
    { id: 5, name: 'Joan Pryce (née Ashworth)', sex: 'f', born: 1952, died: null, parents: [1, 2], spouse: 6, branch: 'ashworth', note: 'Moved to Perth in 1975.', docs: [{ title: 'Letter home, 1975', file: 'docs/letter-joan-1975.svg' }, { title: 'Marriage certificate', file: 'docs/marriage-joan-robert-1974.svg' }] },
    { id: 6, name: 'Robert Pryce', sex: 'm', born: 1949, died: 2020, parents: [24, 25], spouse: 5, branch: 'pryce', note: 'Marine engineer.', docs: [{ title: 'Marriage certificate', file: 'docs/marriage-joan-robert-1974.svg' }] },
    { id: 7, name: 'Daniel Ashworth', sex: 'm', born: 1975, died: null, parents: [3, 4], spouse: 8, branch: 'ashworth', note: 'Architect.', docs: [{ title: 'Birth certificate', file: 'docs/birth-daniel-1975.svg' }] },
    { id: 8, name: 'Priya Ashworth', sex: 'f', born: 1978, died: null, parents: [27, 28], spouse: 7, branch: 'iyer', note: 'Software developer.', docs: [] },
    { id: 9, name: 'Claire Ashworth', sex: 'f', born: 1979, died: null, parents: [3, 4], spouse: null, branch: 'ashworth', note: 'Musician.', docs: [{ title: 'Concert photo, 1999', file: 'docs/photo-claire-1999.svg' }] },
    { id: 10, name: 'Thomas Pryce', sex: 'm', born: 1977, died: null, parents: [5, 6], spouse: 11, branch: 'pryce', note: 'Chef.', docs: [{ title: 'Birth certificate', file: 'docs/birth-thomas-1977.svg' }] },
    { id: 11, name: 'Mei Pryce', sex: 'f', born: 1980, died: null, parents: [30, 31], spouse: 10, branch: 'chen', note: 'Photographer.', docs: [] },
    { id: 12, name: 'Oliver Ashworth', sex: 'm', born: 2005, died: null, parents: [7, 8], spouse: null, branch: 'ashworth', note: 'University student.', docs: [{ title: 'Birth certificate', file: 'docs/birth-oliver-2005.svg' }] },
    { id: 13, name: 'Isla Ashworth', sex: 'f', born: 2009, died: null, parents: [7, 8], spouse: null, branch: 'ashworth', note: 'Loves football.', docs: [{ title: 'Christmas photo, 2018', file: 'docs/photo-isla-leo-2018.svg' }] },
    { id: 14, name: 'Leo Pryce', sex: 'm', born: 2010, died: null, parents: [10, 11], spouse: null, branch: 'pryce', note: 'Budding artist.', docs: [{ title: 'Christmas photo, 2018', file: 'docs/photo-isla-leo-2018.svg' }] },

    { id: 15, name: 'Arthur Ashworth', sex: 'm', born: 1894, died: 1968, parents: [], spouse: 16, branch: 'ashworth', sample: true, note: SAMPLE + 'Walter’s father, so the paternal line can be followed upward.', docs: [] },
    { id: 16, name: 'Mabel Ashworth (née Crowe)', sex: 'f', born: 1898, died: 1975, parents: [], spouse: 15, branch: 'ashworth', sample: true, note: SAMPLE + 'Walter’s mother. Her birth family is Crowe; this chart starts with her, not with a hidden parent.', docs: [] },
    { id: 17, name: 'George Ashworth', sex: 'm', born: 1919, died: 2004, parents: [15, 16], spouse: null, branch: 'ashworth', sample: true, note: SAMPLE + 'Walter’s older brother.', docs: [] },
    { id: 18, name: 'Albert Hale', sex: 'm', born: 1896, died: 1971, parents: [], spouse: 19, branch: 'hale', sample: true, note: SAMPLE + 'Edith’s father. Opening Edith shows this maternal branch.', docs: [] },
    { id: 19, name: 'Clara Hale (née Bennett)', sex: 'f', born: 1900, died: 1984, parents: [], spouse: 18, branch: 'hale', sample: true, note: SAMPLE + 'Edith’s mother. Her birth family is Bennett; she is the earliest Bennett in this chart.', docs: [] },
    { id: 20, name: 'Lydia Hale', sex: 'f', born: 1928, died: null, parents: [18, 19], spouse: null, branch: 'hale', sample: true, note: SAMPLE + 'Edith’s younger sister, so the Hale family is not only the direct ancestor.', docs: [] },
    { id: 21, name: 'Patrick Doyle', sex: 'm', born: 1922, died: 2003, parents: [], spouse: 22, branch: 'doyle', sample: true, note: SAMPLE + 'Margaret’s father. Daniel and Claire’s maternal grandfather.', docs: [] },
    { id: 22, name: 'Nora Doyle (née Kelly)', sex: 'f', born: 1926, died: 2016, parents: [], spouse: 21, branch: 'doyle', sample: true, note: SAMPLE + 'Margaret’s mother. Her birth family is Kelly; she is the earliest Kelly in this chart.', docs: [] },
    { id: 23, name: 'Sean Doyle', sex: 'm', born: 1953, died: null, parents: [21, 22], spouse: null, branch: 'doyle', sample: true, note: SAMPLE + 'Margaret’s younger brother.', docs: [] },
    { id: 24, name: 'Owen Pryce', sex: 'm', born: 1916, died: 1989, parents: [], spouse: 25, branch: 'pryce', sample: true, note: SAMPLE + 'Robert’s father, head of the Pryce partner family.', docs: [] },
    { id: 25, name: 'Gwen Pryce (née Hughes)', sex: 'f', born: 1920, died: 2001, parents: [], spouse: 24, branch: 'pryce', sample: true, note: SAMPLE + 'Robert’s mother. Her birth family is Hughes; she is the earliest Hughes in this chart.', docs: [] },
    { id: 26, name: 'Ellen Pryce', sex: 'f', born: 1952, died: null, parents: [24, 25], spouse: null, branch: 'pryce', sample: true, note: SAMPLE + 'Robert’s younger sister.', docs: [] },
    { id: 27, name: 'Arun Iyer', sex: 'm', born: 1946, died: null, parents: [], spouse: 28, branch: 'iyer', sample: true, note: SAMPLE + 'Priya’s father. Oliver and Isla’s maternal grandfather.', docs: [] },
    { id: 28, name: 'Lakshmi Iyer (née Nair)', sex: 'f', born: 1949, died: null, parents: [], spouse: 27, branch: 'iyer', sample: true, note: SAMPLE + 'Priya’s mother. Her birth family is Nair; she is the earliest Nair in this chart.', docs: [] },
    { id: 29, name: 'Dev Iyer', sex: 'm', born: 1975, died: null, parents: [27, 28], spouse: null, branch: 'iyer', sample: true, note: SAMPLE + 'Priya’s older brother.', docs: [] },
    { id: 30, name: 'Wei Chen', sex: 'm', born: 1948, died: null, parents: [], spouse: 31, branch: 'chen', sample: true, note: SAMPLE + 'Mei’s father. Leo’s maternal grandfather.', docs: [] },
    { id: 31, name: 'Lin Chen (née Zhao)', sex: 'f', born: 1951, died: null, parents: [], spouse: 30, branch: 'chen', sample: true, note: SAMPLE + 'Mei’s mother. Her birth family is Zhao; she is the earliest Zhao in this chart.', docs: [] },
    { id: 32, name: 'Amy Chen', sex: 'f', born: 1983, died: null, parents: [30, 31], spouse: null, branch: 'chen', sample: true, note: SAMPLE + 'Mei’s younger sister.', docs: [] }
  ];

  people.forEach(p => {
    if (!p.portrait) p.portrait = 'portraits/' + p.id + '.svg';
  });

  const CARD_W = 158;
  const CARD_H = 104;
  const H_GAP = 36;
  const V_GAP = 96;
  const PAD = 48;
  // Horizontal runs of a child link stay at least this far above any card top.
  const TOP_CLEAR = 30;

  let by = Object.fromEntries(people.map(p => [p.id, p]));
  let directory = null;

  function lookup(id) {
    return (directory || by)[id] || null;
  }

  function isPdf(file, contentType) {
    return contentType === 'application/pdf' || /\.pdf$/i.test(String(file || ''));
  }

  function cleanLabel(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001F<>]/g, '').slice(0, max);
  }

  function safeFileRef(id) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return '';
    return '/api/files/' + n;
  }

  function dedupeIds(ids) {
    const out = [];
    (ids || []).forEach(id => {
      const n = Number(id);
      if (!Number.isInteger(n) || n <= 0 || out.includes(n)) return;
      out.push(n);
    });
    return out;
  }

  // Blood lines use only two biological parents (one father and one mother)
  // and one current partner. Everyone else stays in the directory and is named
  // in the details. They are not dropped, and they are not drawn as a blood line.
  function fromApproved(payload) {
    const rels = (payload && payload.relationships) || [];
    const raw = (payload && payload.people) || [];
    const sexOf = Object.fromEntries(raw.map(p => [p.id, p.sex]));
    const linked = (id, kind) => dedupeIds(rels
      .filter(row => row.kind === kind && (row.fromId === id || row.toId === id))
      .map(row => row.fromId === id ? row.toId : row.fromId));
    const directed = (id, kind, field) => dedupeIds(
      rels.filter(row => row.kind === kind && row[field] === id).map(row => row[field === 'toId' ? 'fromId' : 'toId'])
    );
    const mapped = raw.map(person => {
      const docs = (person.documents || []).map(doc => {
        const file = safeFileRef(doc.id);
        if (!file) return null;
        return {
          title: cleanLabel(doc.caption || doc.filename || 'Document', 200),
          file,
          contentType: doc.contentType || ''
        };
      }).filter(Boolean);
      const biologicalParentIds = directed(person.id, 'parent_biological', 'toId');
      const father = biologicalParentIds.find(pid => sexOf[pid] === 'm');
      const mother = biologicalParentIds.find(pid => sexOf[pid] === 'f');
      const chartParents = father != null && mother != null && biologicalParentIds.length === 2
        ? [father, mother]
        : [];
      const partnerIds = linked(person.id, 'partner');
      const formerPartners = linked(person.id, 'partner_former').filter(id => !partnerIds.includes(id));
      return {
        id: person.id,
        name: cleanLabel(person.displayName || 'Unnamed', 120),
        sex: person.sex === 'f' || person.sex === 'm' ? person.sex : '',
        born: person.born || 0,
        died: person.died == null ? null : person.died,
        parents: chartParents,
        spouse: partnerIds[0] || null,
        partnerIds,
        branch: person.branch && BRANCHES[person.branch] ? person.branch : 'ashworth',
        note: cleanLabel(person.notes || '', 2000),
        sample: String(person.notes || '').startsWith('Fictional sample relative'),
        portrait: 'portraits/' + person.id + '.svg',
        docs,
        biologicalParentIds,
        biologicalChildIds: directed(person.id, 'parent_biological', 'fromId'),
        formerPartners,
        stepParents: directed(person.id, 'parent_step', 'toId'),
        stepChildIds: directed(person.id, 'parent_step', 'fromId'),
        adoptiveParents: directed(person.id, 'parent_adoptive', 'toId'),
        adoptiveChildIds: directed(person.id, 'parent_adoptive', 'fromId'),
        halfSiblingIds: dedupeIds((person.halfSiblings || []).map(item => item.personId))
      };
    });
    const local = Object.fromEntries(mapped.map(person => [person.id, person]));
    mapped.forEach(person => {
      if (!person.spouse || !local[person.spouse]) {
        person.spouse = null;
        return;
      }
      const back = local[person.spouse];
      if (!back.spouse) back.spouse = person.id;
      else if (back.spouse !== person.id) person.spouse = null;
    });
    const canvas = [];
    const aside = [];
    mapped.forEach(person => {
      const bioChild = person.biologicalChildIds.length > 0;
      const onChart = person.parents.length === 2 || bioChild || !!person.spouse;
      if (onChart) {
        canvas.push(person);
        return;
      }
      const reasons = [];
      if (person.partnerIds.length) reasons.push('Current partner, kept off the couple line');
      if (person.formerPartners.length) reasons.push('Former partner');
      if (person.stepParents.length || person.stepChildIds.length) reasons.push('Step relationship');
      if (person.adoptiveParents.length || person.adoptiveChildIds.length) reasons.push('Adoptive relationship');
      if (person.biologicalParentIds.length === 1) reasons.push('One biological parent, so no couple line is drawn');
      if (!reasons.length) reasons.push('No biological couple line is drawn');
      aside.push(Object.assign({ reason: reasons.join(' · ') }, person));
    });
    return { canvas, aside, directory: local };
  }

  function replacePeople(canvasPeople, everyone) {
    people.splice(0, people.length, ...canvasPeople);
    Object.keys(by).forEach(key => delete by[key]);
    people.forEach(person => { by[person.id] = person; });
    directory = Object.assign({}, by, everyone || {});
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function years(p) {
    return p.born + '–' + (p.died == null ? '' : p.died);
  }

  function lifeText(p, year) {
    const y = year == null ? new Date().getFullYear() : year;
    const span = years(p);
    const age = p.died ? 'died aged ~' + (p.died - p.born) : 'living, ~' + (y - p.born);
    return span + ' (' + age + ')';
  }

  function splitParents(p) {
    const list = (p.parents || []).map(id => lookup(id)).filter(Boolean);
    return {
      father: list.find(q => q.sex === 'm') || null,
      mother: list.find(q => q.sex === 'f') || null
    };
  }

  function sameParents(a, b) {
    if (!a.parents.length || a.parents.length !== b.parents.length) return false;
    const as = a.parents.slice().sort((x, y) => x - y).join(',');
    const bs = b.parents.slice().sort((x, y) => x - y).join(',');
    return as === bs;
  }

  function roster() {
    if (!directory) return people;
    const map = new Map();
    people.forEach(p => map.set(p.id, p));
    Object.keys(directory).forEach(key => {
      const person = directory[key];
      if (person && person.id != null) map.set(person.id, person);
    });
    return Array.from(map.values());
  }

  function siblingsOf(id) {
    const p = lookup(id);
    if (!p) return [];
    return roster()
      .filter(q => q.id !== id && sameParents(p, q))
      .sort((a, b) => (a.born || 0) - (b.born || 0) || a.id - b.id);
  }

  function childrenOf(id) {
    return roster()
      .filter(q => {
        const ids = Array.isArray(q.biologicalParentIds) && q.biologicalParentIds.length
          ? q.biologicalParentIds
          : (q.parents || []);
        return ids.includes(id);
      })
      .sort((a, b) => (a.born || 0) - (b.born || 0) || a.id - b.id);
  }

  function coupleKids(a, b) {
    const ids = new Set([a, b].filter(x => x != null));
    return people
      .filter(p => p.parents.length === ids.size && p.parents.every(pid => ids.has(pid)))
      .sort((p, q) => p.born - q.born || p.id - q.id)
      .map(p => p.id);
  }

  function ancestors(id, seen) {
    const out = seen || new Set();
    const p = by[id];
    if (!p) return out;
    p.parents.forEach(pid => {
      if (out.has(pid)) return;
      out.add(pid);
      ancestors(pid, out);
    });
    return out;
  }

  function closure(id) {
    const out = new Set();
    if (!by[id]) return out;
    (function walk(i) {
      if (out.has(i)) return;
      out.add(i);
      by[i].parents.forEach(walk);
    })(id);
    return out;
  }

  function sideAncestors(id) {
    const person = lookup(id);
    if (!person) return { paternal: new Set(), maternal: new Set() };
    const { father, mother } = splitParents(person);
    return {
      paternal: father ? closure(father.id) : new Set(),
      maternal: mother ? closure(mother.id) : new Set()
    };
  }

  function connectedIds(startId) {
    const seen = new Set();
    const stack = [startId];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id) || !by[id]) continue;
      seen.add(id);
      const p = by[id];
      p.parents.forEach(pid => stack.push(pid));
      if (p.spouse) stack.push(p.spouse);
      childrenOf(id).forEach(c => stack.push(c.id));
    }
    return seen;
  }

  function blood(id, memo, stack) {
    if (memo[id] != null) return memo[id];
    if (stack.has(id)) throw new Error('Parent cycle at ' + id);
    stack.add(id);
    const p = by[id];
    const g = p.parents.length ? 1 + Math.max.apply(null, p.parents.map(pid => blood(pid, memo, stack))) : 0;
    stack.delete(id);
    memo[id] = g;
    return g;
  }

  function cardSpan(n) {
    if (n <= 0) return 0;
    return n * CARD_W + (n - 1) * H_GAP;
  }

  function layoutUnion(primaryId, placed) {
    const primary = by[primaryId];
    if (!primary) throw new Error('Missing person ' + primaryId);
    const spouse = primary.spouse ? by[primary.spouse] : null;
    const sibs = spouse ? siblingsOf(spouse.id) : [];
    const kidIds = coupleKids(primary.id, spouse && spouse.id);
    const kids = kidIds.map(id => layoutUnion(id, placed));

    let cursor = 0;
    kids.forEach(k => {
      k.offX = cursor;
      cursor += k.width + H_GAP;
    });

    const anchorCenters = kids.map(k => k.offX + k.anchorX + CARD_W / 2);
    const rowCount = 1 + (spouse ? 1 : 0) + sibs.length;
    const rowW = cardSpan(rowCount);
    const coupleSpan = cardSpan(spouse ? 2 : 1);
    const targetMid = anchorCenters.length
      ? (Math.min.apply(null, anchorCenters) + Math.max.apply(null, anchorCenters)) / 2
      : rowW / 2;
    const coupleLeft = targetMid - coupleSpan / 2;

    const nodes = [];
    function add(node) {
      if (placed.has(node.id)) throw new Error('Person placed twice: ' + node.id + ' ' + by[node.id].name);
      placed.add(node.id);
      nodes.push(node);
    }

    add({ id: primary.id, x: coupleLeft, y: 0 });
    let spouseX = null;
    if (spouse) {
      spouseX = coupleLeft + CARD_W + H_GAP;
      add({ id: spouse.id, x: spouseX, y: 0 });
    }
    let sibX = (spouse ? spouseX : coupleLeft) + CARD_W + H_GAP;
    sibs.forEach(s => {
      add({ id: s.id, x: sibX, y: 0 });
      sibX += CARD_W + H_GAP;
    });

    if (spouse && spouse.parents.length) {
      const groupW = cardSpan(1 + sibs.length);
      const ordered = splitParents(spouse);
      const pids = [ordered.father, ordered.mother].filter(Boolean).map(p => p.id);
      const use = pids.length === spouse.parents.length ? pids : spouse.parents.slice();
      const wingW = cardSpan(use.length);
      let wx = spouseX + (groupW - wingW) / 2;
      const wingY = -(CARD_H + V_GAP);
      use.forEach(pid => {
        add({ id: pid, x: wx, y: wingY });
        wx += CARD_W + H_GAP;
      });
    }

    let wingUp = 0;
    kids.forEach(k => { wingUp = Math.max(wingUp, -k.minY); });
    const kidsBaseline = CARD_H + V_GAP + wingUp;
    kids.forEach(k => {
      k.nodes.forEach(n => {
        nodes.push({ id: n.id, x: n.x + k.offX, y: n.y + kidsBaseline });
      });
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    });
    nodes.forEach(n => { n.x -= minX; });
    const anchor = nodes.find(n => n.id === primaryId);
    return {
      nodes,
      width: maxX - minX,
      minY,
      maxY,
      anchorX: anchor.x
    };
  }

  function toPath(points) {
    let d = 'M ' + points[0] + ' ' + points[1];
    for (let i = 2; i < points.length; i += 2) d += ' L ' + points[i] + ' ' + points[i + 1];
    return d;
  }

  function labelBox(label) {
    const w = Math.ceil(Math.max(76, label.text.length * 7.3));
    return { x: label.x - w / 2, y: label.y - 18, w: w, h: 16, kind: 'label', text: label.text };
  }

  // True when the open segment cuts the interior of a rectangle.
  function segmentHitsRect(x1, y1, x2, y2, rect) {
    const left = rect.x + 2;
    const right = rect.x + rect.w - 2;
    const top = rect.y + 2;
    const bot = rect.y + rect.h - 2;
    if (right <= left || bot <= top) return false;
    function inside(x, y) {
      return x > left && x < right && y > top && y < bot;
    }
    if (inside(x1, y1) || inside(x2, y2)) return true;
    function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
      const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
      if (den === 0) return false;
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
      return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
    }
    return crosses(x1, y1, x2, y2, left, top, right, top) ||
      crosses(x1, y1, x2, y2, right, top, right, bot) ||
      crosses(x1, y1, x2, y2, right, bot, left, bot) ||
      crosses(x1, y1, x2, y2, left, bot, left, top);
  }

  // A horizontal run that passes over a card must sit well above that card.
  function tooCloseToCardTop(x1, y1, x2, y2, cards) {
    if (y1 !== y2) return null;
    const y = y1;
    const xMin = Math.min(x1, x2);
    const xMax = Math.max(x1, x2);
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (xMax <= c.x + 8 || xMin >= c.x + c.w - 8) continue;
      const above = c.y - y;
      if (above >= 0 && above < TOP_CLEAR) return c;
    }
    return null;
  }

  function pathBlocked(points, obstacles, cards) {
    for (let i = 0; i < points.length - 2; i += 2) {
      const x1 = points[i];
      const y1 = points[i + 1];
      const x2 = points[i + 2];
      const y2 = points[i + 3];
      for (let r = 0; r < obstacles.length; r++) {
        if (segmentHitsRect(x1, y1, x2, y2, obstacles[r])) return true;
      }
      if (tooCloseToCardTop(x1, y1, x2, y2, cards)) return true;
    }
    return false;
  }

  // Drop out of the parent, run high in the gap, then slope down into the child.
  function childLinkPoints(parent, child, sex) {
    const x1 = Math.round(parent.x + parent.w / 2);
    const y1 = parent.y + parent.h;
    const y2 = child.y;
    const arrive = Math.round(child.x + child.w / 2 + (sex === 'f' ? 16 : -16));
    const drop = sex === 'f' ? 28 : 16;
    const dx = arrive - x1;
    const adx = Math.abs(dx);
    let run = 0;
    if (adx >= 48) run = Math.min(64, Math.max(36, Math.round(adx * 0.42)));
    else if (adx >= 18) run = Math.max(16, Math.round(adx * 0.6));
    const dir = adx < 8 ? 0 : Math.sign(dx);

    function pointsAt(railY, kneeFrom) {
      const knee = dir === 0 ? x1 : arrive - dir * run;
      const from = kneeFrom == null ? x1 : kneeFrom;
      const pts = [x1, y1, x1, railY];
      if (Math.abs(from - x1) > 2) pts.push(from, railY);
      if (Math.abs(knee - from) > 2) pts.push(knee, railY);
      pts.push(arrive, y2);
      return pts;
    }

    const rails = [];
    rails.push(y1 + drop);
    for (let y = y1 + 18; y <= y2 - TOP_CLEAR; y += 6) rails.push(y);
    const gutters = [];
    [parent, child].forEach(c => {
      gutters.push(Math.round(c.x - 18), Math.round(c.x + c.w + 18));
    });

    return { x1, y1, y2, arrive, pointsAt, rails, gutters, run, dir };
  }

  function route(parent, child, cards, labels, sex) {
    const plan = childLinkPoints(parent, child, sex);
    const skip = new Set([parent.id, child.id]);
    const obstacles = [];
    cards.forEach(c => {
      if (!skip.has(c.id)) obstacles.push(c);
    });
    (labels || []).forEach(label => obstacles.push(labelBox(label)));

    function ok(pts) {
      if (pts[1] >= pts[pts.length - 1]) return false;
      return !pathBlocked(pts, obstacles, cards);
    }

    let best = null;
    plan.rails.forEach(rail => {
      if (rail < plan.y1 + 14 || rail > plan.y2 - TOP_CLEAR) return;
      const pts = plan.pointsAt(rail);
      if (!ok(pts)) return;
      const score = Math.abs(rail - (plan.y1 + (sex === 'f' ? 28 : 16)));
      if (!best || score < best.score) best = { pts, score };
    });
    if (best) return best.pts;

    plan.rails.forEach(rail => {
      if (rail < plan.y1 + 14 || rail > plan.y2 - TOP_CLEAR) return;
      plan.gutters.forEach(gutter => {
        const knee = plan.dir === 0 ? gutter : plan.arrive - plan.dir * Math.min(plan.run || 28, 36);
        const low = plan.y2 - TOP_CLEAR;
        if (low <= rail + 8) return;
        const pts = [plan.x1, plan.y1, plan.x1, rail, gutter, rail, gutter, low];
        if (Math.abs(knee - gutter) > 2) pts.push(knee, low);
        pts.push(plan.arrive, plan.y2);
        if (!ok(pts)) return;
        const score = 1000 + Math.abs(rail - (plan.y1 + 22)) + Math.abs(gutter - plan.x1);
        if (!best || score < best.score) best = { pts, score };
      });
    });
    if (best) return best.pts;
    const fallbackRail = Math.min(plan.y1 + 22, plan.y2 - TOP_CLEAR);
    return plan.pointsAt(Math.max(plan.y1 + 14, fallbackRail));
  }

  function layoutFrom(rootId) {
    const placed = new Set();
    const built = layoutUnion(rootId, placed);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    built.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    });
    const cards = built.nodes.map(n => {
      const p = by[n.id];
      const branch = BRANCHES[p.branch];
      return {
        id: p.id,
        x: Math.round(n.x - minX + PAD),
        y: Math.round(n.y - minY + PAD),
        w: CARD_W,
        h: CARD_H,
        family: branch.name,
        kind: branch.kind,
        label: branch.label,
        color: branch.color,
        sample: !!p.sample
      };
    });
    const cardById = Object.fromEntries(cards.map(c => [c.id, c]));
    const links = [];
    people.forEach(p => {
      if (!p.spouse || p.id > p.spouse) return;
      if (!cardById[p.id] || !cardById[p.spouse]) return;
      const a = cardById[p.id];
      const b = cardById[p.spouse];
      const left = a.x <= b.x ? a : b;
      const right = a.x <= b.x ? b : a;
      const y = Math.round(left.y + left.h / 2);
      const x1 = left.x + left.w;
      const x2 = right.x;
      links.push({
        type: 'spouse',
        a: left.id,
        b: right.id,
        x: Math.round((x1 + x2) / 2),
        y,
        d: 'M ' + x1 + ' ' + y + ' L ' + x2 + ' ' + y
      });
    });
    const labels = [];
    people.forEach(p => {
      if (p.parents.length || !p.spouse || p.id > p.spouse) return;
      if (!cardById[p.id] || !cardById[p.spouse]) return;
      const a = cardById[p.id];
      const b = cardById[p.spouse];
      const branch = BRANCHES[p.branch] || BRANCHES[by[p.spouse].branch];
      labels.push({
        text: branch.label,
        branch: branch.key,
        color: branch.color,
        x: Math.round((Math.min(a.x, b.x) + Math.max(a.x, b.x) + CARD_W) / 2),
        y: Math.min(a.y, b.y) - 8
      });
    });
    people.forEach(child => {
      child.parents.forEach(pid => {
        if (!cardById[child.id] || !cardById[pid]) return;
        const parent = by[pid];
        const side = parent.sex === 'f' ? 'maternal' : 'paternal';
        const points = route(cardById[pid], cardById[child.id], cards, labels, parent.sex);
        links.push({
          type: 'parent',
          parent: pid,
          child: child.id,
          side,
          color: side === 'maternal' ? '#2c6e91' : '#8a5a3c',
          points,
          d: toPath(points)
        });
      });
    });
    return {
      rootId,
      cards,
      links,
      labels,
      width: Math.round(maxX - minX + PAD * 2),
      height: Math.round(maxY - minY + PAD * 2),
      placed: placed.size
    };
  }

  function preferSeed(a, b) {
    if ((a.branch === 'ashworth') !== (b.branch === 'ashworth')) return a.branch === 'ashworth' ? -1 : 1;
    if (a.sex !== b.sex) return a.sex === 'm' ? -1 : 1;
    return a.id - b.id;
  }

  function layoutTree(options) {
    const allowPartial = options && options.allowPartial;
    const seeds = people.filter(p => p.parents.length === 0 && p.spouse);
    let best = null;
    seeds.forEach(seed => {
      let laid = null;
      let error = null;
      try { laid = layoutFrom(seed.id); } catch (err) { error = err; }
      const score = laid ? laid.cards.length : 0;
      if (!best || score > best.score || (score === best.score && !error && preferSeed(seed, best.seed) < 0)) {
        best = { score, seed, laid, error };
      }
    });
    if (!best || !best.laid || (best.score !== people.length && !allowPartial)) {
      throw new Error('Layout did not place every person (best ' + (best && best.score) + ')');
    }
    if (best && best.laid) {
      best.laid.rootId = best.seed.id;
      if (best.score !== people.length) {
        const placed = new Set(best.laid.cards.map(card => card.id));
        best.laid.unplaced = people.filter(person => !placed.has(person.id)).map(person => person.id);
      }
    }
    return best.laid;
  }

  function relationPhrase(member, other) {
    if (member.spouse === other.id) return 'Married to ' + other.name;
    if (other.parents.includes(member.id)) return 'Parent of ' + other.name;
    if (member.parents.includes(other.id)) {
      return (other.sex === 'f' ? 'Mother: ' : 'Father: ') + other.name;
    }
    return other.name;
  }

  function branchSections() {
    const memo = {};
    const stack = new Set();
    return SECTION_COPY.map(copy => {
      const meta = BRANCHES[copy.branch];
      const members = people
        .filter(p => p.branch === copy.branch)
        .slice()
        .sort((a, b) => blood(a.id, memo, stack) - blood(b.id, memo, stack) || a.born - b.born || a.id - b.id);
      const memberIds = new Set(members.map(p => p.id));
      const relatedMap = new Map();
      members.forEach(m => {
        const others = []
          .concat(m.spouse ? [by[m.spouse]] : [])
          .concat(m.parents.map(id => by[id]))
          .concat(childrenOf(m.id));
        others.forEach(o => {
          if (!o || memberIds.has(o.id)) return;
          const phrase = relationPhrase(m, o);
          if (!relatedMap.has(o.id)) relatedMap.set(o.id, { id: o.id, name: o.name, phrases: [] });
          const row = relatedMap.get(o.id);
          if (!row.phrases.includes(phrase)) row.phrases.push(phrase);
        });
      });
      return {
        branch: meta.key,
        name: meta.name,
        kind: meta.kind,
        label: meta.label,
        color: meta.color,
        blurb: copy.blurb,
        members: members.map(p => p.id),
        related: Array.from(relatedMap.values()).map(r => ({
          id: r.id,
          name: r.name,
          label: r.phrases.join('; ')
        }))
      };
    });
  }

  function earliestText() {
    return 'Earliest generation shown — parents are not in this chart';
  }

  function personButton(p) {
    return '<button type="button" class="rel" data-id="' + p.id + '">' + esc(p.name) + '</button>';
  }

  function parentLine(parent, emptyText) {
    if (!parent) return emptyText || earliestText();
    const folks = splitParents(parent);
    const meta = BRANCHES[parent.branch];
    const gp = [folks.father, folks.mother].filter(Boolean).map(personButton).join(' ');
    return personButton(parent) + ' <span class="tag">' + esc(meta.label) + '</span>' +
      (gp ? '<span class="gp">Parents ' + gp + '</span>' : '<span class="gp">' + esc(earliestText()) + '</span>');
  }

  function portraitInfo(p) {
    const name = p && p.name ? p.name : 'this person';
    if (p && p.portrait) {
      return {
        src: p.portrait,
        caption: 'Example portrait · fictional, not a real person',
        alt: 'Illustrated example portrait of ' + name + ', not a real photograph',
        fallback: false
      };
    }
    return {
      src: 'portraits/placeholder.svg',
      caption: 'Example portrait · none on file for this person',
      alt: 'Illustrated example portrait placeholder, not a real person',
      fallback: true
    };
  }

  // Keep a fixed-size popover inside the viewport. Prefer above the card.
  function placePopover(rect, popW, popH, viewW, viewH, margin) {
    const m = margin == null ? 8 : margin;
    let left = rect.left + rect.width / 2 - popW / 2;
    let top = rect.top - popH - 10;
    let placement = 'above';
    if (top < m) {
      top = rect.bottom + 10;
      placement = 'below';
    }
    if (top + popH > viewH - m) {
      top = Math.max(m, Math.min(rect.top, viewH - m - popH));
      placement = 'beside';
    }
    left = Math.max(m, Math.min(left, viewW - m - popW));
    top = Math.max(m, Math.min(top, viewH - m - popH));
    return { left: Math.round(left), top: Math.round(top), placement };
  }

  function detailHtml(id, year) {
    return buildDetail(lookup(id), year, lookup);
  }

  function namedPeople(ids, find, suffix) {
    return (ids || []).map(id => {
      const person = find(id);
      return esc(person ? person.name : ('Person ' + id)) + suffix;
    }).join('; ');
  }

  function relationBits(p) {
    const bits = [];
    const add = (label, ids) => {
      if (ids && ids.length) bits.push({ label, ids });
    };
    add('Current partners', (p.partnerIds || []).filter(id => id !== p.spouse));
    add('Former partners', p.formerPartners);
    add('Step parents', p.stepParents);
    add('Adoptive parents', p.adoptiveParents);
    add('Half-siblings', p.halfSiblingIds);
    add('Step children', p.stepChildIds);
    add('Adoptive children', p.adoptiveChildIds);
    return bits;
  }

  // find resolves ids in the approved directory. The public chart passes lookup.
  function buildDetail(p, year, find) {
    if (!p) return '';
    const resolve = find || lookup;
    const recorded = Array.isArray(p.biologicalParentIds);
    const listed = recorded
      ? p.biologicalParentIds.map(id => resolve(id)).filter(Boolean)
      : null;
    const father = listed ? (listed.find(q => q.sex === 'm') || null) : splitParents(p).father;
    const mother = listed ? (listed.find(q => q.sex === 'f') || null) : splitParents(p).mother;
    const otherBio = listed ? listed.filter(q => q !== father && q !== mother) : [];
    const sibs = siblingsOf(p.id);
    const kids = Array.isArray(p.biologicalChildIds)
      ? p.biologicalChildIds.map(id => resolve(id)).filter(Boolean)
      : childrenOf(p.id);
    const spouse = p.spouse ? resolve(p.spouse) : null;
    const spouseParents = spouse ? splitParents(spouse) : { father: null, mother: null };
    const branch = BRANCHES[p.branch] || BRANCHES.ashworth;
    const portrait = portraitInfo(p);
    const docs = (p.docs || []).filter(doc => doc && doc.title && doc.file && !String(doc.file).includes('://') && !String(doc.file).startsWith('//'));
    const docHtml = docs.length ? '<ul class="docs">' + docs.map((x, i) => {
      const pdf = isPdf(x.file, x.contentType);
      const thumb = String(x.file).indexOf('/api/files/') === 0 ? '' : '<img src="' + esc(x.file) + '" alt="">';
      if (pdf) {
        return '<li><a href="' + esc(x.file) + '" target="_blank" rel="noopener" data-type="pdf" data-doc="' + p.id + ':' + i + '"><span class="pdf">PDF</span>' + esc(x.title) + '</a></li>';
      }
      return '<li><a href="' + esc(x.file) + '" data-doc="' + p.id + ':' + i + '" data-type="image">' + thumb + esc(x.title) + '</a></li>';
    }).join('') + '</ul>' : '<span>None yet</span>';
    const bits = relationBits(p);
    const suffixes = {
      'Current partners': ' — current partnership, not the couple drawn on the chart',
      'Former partners': ' — not a current spouse, and not a blood line',
      'Step parents': ' — step relationship, not drawn as a biological parent',
      'Adoptive parents': ' — adoptive relationship, not drawn as a biological parent',
      'Half-siblings': ' — shares one biological parent',
      'Step children': ' — step relationship, not a biological child',
      'Adoptive children': ' — adoptive relationship, not a biological child'
    };
    const recordedLine = bits.length
      ? '<p class="recorded">' + bits.map(bit => '<strong>' + esc(bit.label) + ':</strong> ' + namedPeople(bit.ids, resolve, suffixes[bit.label])).join('<br>') + '</p>'
      : '';
    const extras = bits.map(bit => '<dt>' + esc(bit.label) + '</dt><dd>' + namedPeople(bit.ids, resolve, suffixes[bit.label]) + '</dd>').join('') +
      (otherBio.length ? '<dt>Other biological parents</dt><dd>' + otherBio.map(personButton).join(' ') + '</dd>' : '');
    const emptyParent = recorded ? 'Not recorded in the approved relationships' : earliestText();
    const spouseParentHtml = spouse
      ? [spouseParents.father, spouseParents.mother].filter(Boolean).map(personButton).join(' ') || esc(recorded ? emptyParent : earliestText())
      : '—';
    return '<div class="pin">' +
      '<h3>' + esc(p.name) + '</h3>' +
      '<div class="sheet">' +
      '<figure class="portrait"><img src="' + esc(portrait.src) + '" alt="' + esc(portrait.alt) + '" data-fallback="portraits/placeholder.svg"><figcaption>' + esc(portrait.caption) + '</figcaption></figure>' +
      '<div class="who">' +
      '<div class="life">' + esc(lifeText(p, year)) + '</div>' +
      '<p class="role" style="color:' + branch.color + '">' + esc(branch.label) + '</p>' +
      (p.sample ? '<p class="sampleflag">Sample · fictional</p>' : '') +
      '<p class="note">' + esc(p.note || '') + '</p>' +
      recordedLine +
      '</div></div>' +
      '<section class="docblock"><h4>Documents</h4>' + docHtml + '</section>' +
      '</div>' +
      '<div class="rels"><dl>' +
      '<dt>Father</dt><dd>' + parentLine(father, emptyParent) + '</dd>' +
      '<dt>Mother</dt><dd>' + parentLine(mother, emptyParent) + '</dd>' +
      '<dt>Spouse</dt><dd>' + (spouse ? personButton(spouse) : '—') + '</dd>' +
      '<dt>Spouse’s parents</dt><dd>' + spouseParentHtml + '</dd>' +
      '<dt>Siblings</dt><dd>' + (sibs.length ? sibs.map(personButton).join(' ') : '—') + '</dd>' +
      '<dt>Children</dt><dd>' + (kids.length ? kids.map(personButton).join(' ') : '—') + '</dd>' +
      extras +
      '</dl></div>';
  }

  function fitScale(contentW, contentH, viewW, viewH, pad) {
    const inset = pad == null ? 16 : pad;
    return Math.min((viewW - inset) / contentW, (viewH - inset) / contentH);
  }

  function validate() {
    const ids = new Set();
    people.forEach(p => {
      if (ids.has(p.id)) throw new Error('Duplicate id ' + p.id);
      ids.add(p.id);
      if (!BRANCHES[p.branch]) throw new Error('Bad branch ' + p.id);
      if (p.spouse) {
        const s = by[p.spouse];
        if (!s || s.spouse !== p.id) throw new Error('Spouse link broken ' + p.id);
      }
      p.parents.forEach(pid => {
        if (!by[pid]) throw new Error('Missing parent ' + pid + ' of ' + p.id);
      });
      if (p.parents.length) {
        if (p.parents.length !== 2) throw new Error('Expected both parents for ' + p.id);
        const pair = splitParents(p);
        if (!pair.father || !pair.mother) throw new Error('Parents must be one father and one mother for ' + p.id);
        if (pair.father.spouse !== pair.mother.id || pair.mother.spouse !== pair.father.id) {
          throw new Error('Parents are not spouses for ' + p.id);
        }
      }
      (p.docs || []).forEach(d => {
        if (!d.title || !d.file) throw new Error('Bad doc on ' + p.id);
      });
    });
    const memo = {};
    people.forEach(p => blood(p.id, memo, new Set()));
    const component = connectedIds(people[0].id);
    if (component.size !== people.length) {
      const missing = people.filter(p => !component.has(p.id)).map(p => p.id);
      throw new Error('Disconnected people: ' + missing.join(','));
    }
  }

  validate();

  return {
    people,
    BRANCHES,
    SECTION_COPY,
    CARD_W,
    CARD_H,
    TOP_CLEAR,
    by,
    isPdf,
    years,
    lifeText,
    splitParents,
    siblingsOf,
    childrenOf,
    ancestors,
    sideAncestors,
    connectedIds,
    layoutFrom,
    layoutTree,
    fromApproved,
    replacePeople,
    branchSections,
    detailHtml,
    buildDetail,
    getPerson: lookup,
    portraitInfo,
    placePopover,
    labelBox,
    segmentHitsRect,
    tooCloseToCardTop,
    fitScale,
    earliestText,
    esc
  };
});
