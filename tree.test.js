// Relationship and layout tests for the practice family tree.
// Run from the repository root: node --test tree.test.js
//
// Covers:
// - original people, notes, spouses, parent links, and documents are unchanged
// - maternal ancestors exist and can be walked (Hale, Doyle, and each mother's parents)
// - partner families exist (Pryce, Iyer, Chen) and are connected
// - every person is in one connected component and is drawn exactly once
// - spouses share a row, parents sit above their children, cards do not overlap
// - parent lines do not cut through cards or labels
// - horizontal child-link runs stay clear of card tops and slope toward the child
// - marriage links stay horizontal and separate from child links
// - example portraits are local illustrated files, with a fallback when none is set
// - details HTML exposes both parents, spouse's parents, and PDF vs image documents
// - mobile branch sections include every person and the cross-branch links
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FT = require('./tree.js');

const ORIGINAL = {
  1: { name: 'Walter Ashworth', sex: 'm', born: 1921, died: 1994, spouse: 2, note: 'Carpenter from Ballarat.', docs: ['docs/birth-walter-1921.svg', 'docs/marriage-walter-edith-1946.svg', 'docs/will-walter-1990.pdf'] },
  2: { name: 'Edith Ashworth (née Hale)', sex: 'f', born: 1924, died: 2009, spouse: 1, note: 'Schoolteacher and keen gardener.', docs: ['docs/birth-edith-1924.svg', 'docs/photo-ashworths-1950.svg', 'docs/recipes-edith.pdf'] },
  3: { name: 'Harold Ashworth', sex: 'm', born: 1948, died: 2015, spouse: 4, parents: [1, 2], note: 'Eldest son; ran the family hardware shop.', docs: ['docs/birth-harold-1948.svg', 'docs/marriage-harold-margaret-1973.svg', 'docs/obituary-harold-2015.pdf'] },
  4: { name: 'Margaret Ashworth (née Doyle)', sex: 'f', born: 1950, died: null, spouse: 3, note: 'Retired nurse.', docs: ['docs/marriage-harold-margaret-1973.svg'] },
  5: { name: 'Joan Pryce (née Ashworth)', sex: 'f', born: 1952, died: null, spouse: 6, parents: [1, 2], note: 'Moved to Perth in 1975.', docs: ['docs/letter-joan-1975.svg', 'docs/marriage-joan-robert-1974.svg'] },
  6: { name: 'Robert Pryce', sex: 'm', born: 1949, died: 2020, spouse: 5, note: 'Marine engineer.', docs: ['docs/marriage-joan-robert-1974.svg'] },
  7: { name: 'Daniel Ashworth', sex: 'm', born: 1975, died: null, spouse: 8, parents: [3, 4], note: 'Architect.', docs: ['docs/birth-daniel-1975.svg'] },
  8: { name: 'Priya Ashworth', sex: 'f', born: 1978, died: null, spouse: 7, note: 'Software developer.', docs: [] },
  9: { name: 'Claire Ashworth', sex: 'f', born: 1979, died: null, spouse: null, parents: [3, 4], note: 'Musician.', docs: ['docs/photo-claire-1999.svg'] },
  10: { name: 'Thomas Pryce', sex: 'm', born: 1977, died: null, spouse: 11, parents: [5, 6], note: 'Chef.', docs: ['docs/birth-thomas-1977.svg'] },
  11: { name: 'Mei Pryce', sex: 'f', born: 1980, died: null, spouse: 10, note: 'Photographer.', docs: [] },
  12: { name: 'Oliver Ashworth', sex: 'm', born: 2005, died: null, spouse: null, parents: [7, 8], note: 'University student.', docs: ['docs/birth-oliver-2005.svg'] },
  13: { name: 'Isla Ashworth', sex: 'f', born: 2009, died: null, spouse: null, parents: [7, 8], note: 'Loves football.', docs: ['docs/photo-isla-leo-2018.svg'] },
  14: { name: 'Leo Pryce', sex: 'm', born: 2010, died: null, spouse: null, parents: [10, 11], note: 'Budding artist.', docs: ['docs/photo-isla-leo-2018.svg'] }
};

test('original people, notes, spouses, documents, and known parents are unchanged', () => {
  Object.entries(ORIGINAL).forEach(([id, exp]) => {
    const p = FT.by[+id];
    assert.ok(p, 'missing original person ' + id);
    assert.equal(p.name, exp.name);
    assert.equal(p.sex, exp.sex);
    assert.equal(p.born, exp.born);
    assert.equal(p.died, exp.died);
    assert.equal(p.spouse, exp.spouse);
    assert.equal(p.note, exp.note);
    assert.deepEqual((p.docs || []).map(d => d.file), exp.docs);
    assert.equal(p.sample, undefined);
    if (exp.parents) assert.deepEqual(p.parents, exp.parents);
  });
});

test('people who had no parents now have both a father and a mother', () => {
  const filled = { 1: [15, 16], 2: [18, 19], 4: [21, 22], 6: [24, 25], 8: [27, 28], 11: [30, 31] };
  Object.entries(filled).forEach(([id, parents]) => {
    const p = FT.by[+id];
    assert.deepEqual(p.parents, parents);
    const { father, mother } = FT.splitParents(p);
    assert.equal(father.sex, 'm');
    assert.equal(mother.sex, 'f');
    assert.equal(father.sample, true);
    assert.equal(mother.sample, true);
  });
});

test('sample relatives are clearly fictional and every branch has a family', () => {
  const samples = FT.people.filter(p => p.sample);
  assert.ok(samples.length >= 18);
  samples.forEach(p => {
    assert.match(p.note, /^Fictional sample relative — not a real person\./);
    assert.equal((p.docs || []).length, 0);
  });
  ['ashworth', 'hale', 'doyle', 'pryce', 'iyer', 'chen'].forEach(key => {
    const group = FT.people.filter(p => p.branch === key);
    assert.ok(group.length >= 3, key);
    assert.ok(group.some(p => p.sample), key + ' needs a labelled sample');
  });
});

test('maternal ancestors can be walked from both parents', () => {
  const oliver = FT.sideAncestors(12);
  // Mother Priya, then her Iyer parents. Father's side still includes the Doyle and Hale mothers.
  [8, 27, 28].forEach(id => assert.ok(oliver.maternal.has(id), 'Oliver maternal missing ' + FT.by[id].name));
  [7, 3, 4, 21, 22, 1, 2, 18, 19, 15, 16].forEach(id => {
    assert.ok(oliver.paternal.has(id), 'Oliver paternal missing ' + FT.by[id].name);
  });
  assert.equal(FT.by[2].branch, 'hale');
  assert.equal(FT.by[4].branch, 'doyle');
  assert.equal(FT.by[8].branch, 'iyer');

  const leo = FT.sideAncestors(14);
  [11, 30, 31].forEach(id => assert.ok(leo.maternal.has(id), 'Leo maternal missing ' + FT.by[id].name));
  [10, 6, 24, 25, 5, 1, 2, 18, 19].forEach(id => {
    assert.ok(leo.paternal.has(id), 'Leo paternal missing ' + FT.by[id].name);
  });

  // Edith herself is the maternal parent of Harold and Joan.
  const harold = FT.sideAncestors(3);
  assert.ok(harold.maternal.has(2));
  assert.ok(harold.maternal.has(18));
  assert.ok(harold.maternal.has(19));
  assert.ok(harold.paternal.has(1));
  assert.ok(harold.paternal.has(15));
  assert.ok(harold.paternal.has(16));
});

test('partner families are present and linked, not loose names', () => {
  const robert = FT.by[6];
  assert.deepEqual(robert.parents, [24, 25]);
  assert.ok(FT.siblingsOf(6).some(p => p.id === 26));
  assert.equal(FT.by[24].branch, 'pryce');
  assert.equal(FT.by[25].branch, 'pryce');

  assert.ok(FT.siblingsOf(8).some(p => p.id === 29));
  assert.ok(FT.siblingsOf(11).some(p => p.id === 32));
  assert.ok(FT.siblingsOf(4).some(p => p.id === 23));
  assert.ok(FT.siblingsOf(2).some(p => p.id === 20));
  assert.ok(FT.siblingsOf(1).some(p => p.id === 17));

  const spouseParents = FT.splitParents(FT.by[6]);
  assert.equal(spouseParents.father.name, 'Owen Pryce');
  assert.equal(spouseParents.mother.name, 'Gwen Pryce (née Hughes)');
});

test('the whole chart is one connected family and spouse links are symmetric', () => {
  const seen = FT.connectedIds(1);
  assert.equal(seen.size, FT.people.length);
  FT.people.forEach(p => {
    assert.ok(seen.has(p.id));
    if (p.spouse) assert.equal(FT.by[p.spouse].spouse, p.id);
  });
  // Roots say so explicitly; nobody else is missing a parent.
  const roots = FT.people.filter(p => p.parents.length === 0);
  assert.ok(roots.length >= 12);
  roots.forEach(p => assert.equal(p.sample, true));
  assert.match(FT.earliestText(), /Earliest generation/);
  const nonRoots = FT.people.filter(p => p.id <= 14);
  nonRoots.forEach(p => assert.equal(p.parents.length, 2));
});

test('layout draws every person once, with parents above and spouses together', () => {
  const laid = FT.layoutTree();
  assert.equal(laid.cards.length, FT.people.length);
  assert.equal(new Set(laid.cards.map(c => c.id)).size, FT.people.length);
  const at = Object.fromEntries(laid.cards.map(c => [c.id, c]));
  FT.people.forEach(p => {
    p.parents.forEach(pid => {
      assert.ok(at[pid].y + at[pid].h <= at[p.id].y, FT.by[pid].name + ' should sit above ' + p.name);
    });
    if (p.spouse && p.id < p.spouse) {
      assert.equal(at[p.id].y, at[p.spouse].y);
    }
  });
  for (let i = 0; i < laid.cards.length; i++) {
    for (let j = i + 1; j < laid.cards.length; j++) {
      const a = laid.cards[i];
      const b = laid.cards[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, 'overlap ' + a.id + ' ' + b.id);
    }
  }
  ['Ashworth · paternal', 'Hale · maternal', 'Doyle · maternal', 'Pryce · partner', 'Iyer · partner', 'Chen · partner']
    .forEach(label => assert.ok(laid.labels.some(l => l.text === label), label));
});

test('parent lines exist for both sexes and do not cut through a card', () => {
  const laid = FT.layoutTree();
  const parentLinks = laid.links.filter(l => l.type === 'parent');
  assert.equal(parentLinks.length, FT.people.reduce((n, p) => n + p.parents.length, 0));
  const maternal = parentLinks.filter(l => l.side === 'maternal');
  const paternal = parentLinks.filter(l => l.side === 'paternal');
  assert.ok(maternal.some(l => l.parent === 2 && l.child === 3));
  assert.ok(maternal.some(l => l.parent === 4 && l.child === 7));
  assert.ok(maternal.some(l => l.parent === 8 && l.child === 12));
  assert.ok(maternal.some(l => l.parent === 11 && l.child === 14));
  assert.ok(paternal.some(l => l.parent === 15 && l.child === 1));
  parentLinks.forEach(link => {
    const pts = link.points;
    assert.ok(pts && pts.length >= 4, 'missing points for ' + link.parent);
    for (let i = 0; i < pts.length - 2; i += 2) {
      laid.cards.forEach(c => {
        if (c.id === link.parent || c.id === link.child) return;
        assert.equal(
          FT.segmentHitsRect(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], c),
          false,
          'line through ' + FT.by[c.id].name + ' for ' + link.parent + '→' + link.child
        );
      });
      laid.labels.forEach(label => {
        assert.equal(
          FT.segmentHitsRect(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], FT.labelBox(label)),
          false,
          'line through label ' + label.text
        );
      });
    }
  });
  const spouses = laid.links.filter(l => l.type === 'spouse');
  assert.equal(spouses.length, FT.people.filter(p => p.spouse && p.id < p.spouse).length);
});

test('child links are raised clear of card tops and slope toward the offspring', () => {
  const laid = FT.layoutTree();
  const at = Object.fromEntries(laid.cards.map(c => [c.id, c]));
  const parents = laid.links.filter(l => l.type === 'parent');
  assert.equal(parents.length, FT.people.reduce((n, p) => n + p.parents.length, 0));
  parents.forEach(link => {
    const child = at[link.child];
    const parent = at[link.parent];
    const pts = link.points;
    const endX = pts[pts.length - 2];
    const endY = pts[pts.length - 1];
    const prevX = pts[pts.length - 4];
    const prevY = pts[pts.length - 3];
    assert.ok(Math.abs(endY - child.y) <= 1, 'link should meet the child top');
    assert.ok(endY > prevY, 'last segment should descend');
    const pcx = parent.x + parent.w / 2;
    const ccx = child.x + child.w / 2;
    if (Math.abs(pcx - ccx) >= 48) {
      assert.notEqual(prevX, endX, FT.by[link.parent].name + ' → ' + FT.by[link.child].name + ' should slope');
      assert.ok(Math.abs(endX - prevX) >= 16, 'slope should be visibly angled');
    }
    for (let i = 0; i < pts.length - 2; i += 2) {
      const close = FT.tooCloseToCardTop(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], laid.cards);
      assert.equal(close, null, 'horizontal too close to ' + (close && FT.by[close.id].name));
    }
    // Father and mother do not arrive on the same point, so both connections stay visible.
    const twin = parents.find(other => other.child === link.child && other.parent !== link.parent);
    if (twin && link.parent < twin.parent) {
      assert.notEqual(endX, twin.points[twin.points.length - 2]);
    }
  });
  laid.links.filter(l => l.type === 'spouse').forEach(link => {
    const nums = link.d.match(/-?\d+/g).map(Number);
    assert.equal(nums.length, 4);
    assert.equal(nums[1], nums[3], 'marriage link stays horizontal');
    const card = at[link.a];
    assert.ok(nums[1] > card.y + 20 && nums[1] < card.y + card.h - 20);
  });
});

test('example portraits are local files, labelled fictional, and optional', () => {
  FT.people.forEach(p => {
    assert.match(p.portrait, /^portraits\/\d+\.svg$/);
    assert.equal(fs.existsSync(path.join(__dirname, p.portrait)), true);
    const svg = fs.readFileSync(path.join(__dirname, p.portrait), 'utf8');
    assert.match(svg, /<svg/);
    assert.match(svg, /EXAMPLE/);
    assert.doesNotMatch(p.portrait, /^https?:/);
  });
  const info = FT.portraitInfo(FT.by[1]);
  assert.match(info.caption, /Example portrait/);
  assert.match(info.caption, /not a real person/);
  assert.equal(info.fallback, false);
  const missing = FT.portraitInfo({ id: 99, name: 'Absent Sample' });
  assert.equal(missing.fallback, true);
  assert.equal(missing.src, 'portraits/placeholder.svg');
  assert.match(missing.caption, /none on file/);
  const html = FT.detailHtml(4, 2026);
  assert.match(html, /portraits\/4\.svg/);
  assert.match(html, /Example portrait · fictional, not a real person/);
  assert.match(html, /data-fallback="portraits\/placeholder\.svg"/);
  const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(page, /id="pop"/);
  assert.match(page, /pointer-events:\s*none/);
  assert.match(page, /pointerType === 'touch'/);
  assert.match(page, /focusin/);
  assert.match(page, /placePopover/);
});

test('portrait popovers are kept inside the viewport', () => {
  const pop = { w: 156, h: 190 };
  const above = FT.placePopover({ left: 400, top: 300, width: 160, height: 100, bottom: 400, right: 560 }, pop.w, pop.h, 1200, 800, 8);
  assert.equal(above.placement, 'above');
  assert.ok(above.top >= 8 && above.left >= 8);
  assert.ok(above.top + pop.h <= 792 && above.left + pop.w <= 1192);
  const below = FT.placePopover({ left: 400, top: 10, width: 160, height: 80, bottom: 90, right: 560 }, pop.w, pop.h, 1200, 800, 8);
  assert.equal(below.placement, 'below');
  assert.ok(below.top >= 90);
  const edge = FT.placePopover({ left: 0, top: 400, width: 80, height: 80, bottom: 480, right: 80 }, pop.w, pop.h, 390, 700, 8);
  assert.ok(edge.left >= 8);
  assert.ok(edge.left + pop.w <= 382);
  assert.ok(edge.top + pop.h <= 692);
});

test('details offer both parents, partner families, and the original documents', () => {
  const oliver = FT.detailHtml(12, 2026);
  assert.match(oliver, /Father/);
  assert.match(oliver, /Mother/);
  assert.match(oliver, /Daniel Ashworth/);
  assert.match(oliver, /Priya Ashworth/);
  assert.match(oliver, /Arun Iyer/);
  assert.match(oliver, /Lakshmi Iyer/);
  assert.match(oliver, /Iyer · partner/);
  assert.match(oliver, /data-id="8"/);
  assert.match(oliver, /data-id="7"/);

  const walter = FT.detailHtml(1, 2026);
  assert.match(walter, /Arthur Ashworth/);
  assert.match(walter, /Mabel Ashworth/);
  assert.match(walter, /Hale · maternal|Edith Ashworth/);
  assert.match(walter, /docs\/will-walter-1990\.pdf/);
  assert.match(walter, /target="_blank"/);
  assert.match(walter, /data-doc="1:0"/);
  assert.match(walter, /data-doc="1:1"/);
  assert.equal(FT.isPdf('docs/will-walter-1990.pdf'), true);
  assert.equal(FT.isPdf('docs/birth-walter-1921.svg'), false);
  assert.match(walter, /Will \(PDF\)/);
  assert.match(walter, /Birth certificate/);

  const walterOrder = FT.detailHtml(1, 2026);
  assert.ok(walterOrder.indexOf('Documents') < walterOrder.indexOf('>Father<'), 'documents should lead the details, ahead of the relationship list');
  assert.ok(walterOrder.indexOf('Birth certificate') < walterOrder.indexOf('>Father<'));
  assert.ok(walterOrder.indexOf('Will (PDF)') < walterOrder.indexOf('>Father<'));
  const withDocs = FT.people.filter(p => p.id <= 14 && p.docs && p.docs.length);
  assert.equal(withDocs.length, 12);
  assert.deepEqual(FT.by[1].docs.map(d => d.title), ['Birth certificate', 'Marriage certificate', 'Will (PDF)']);
  assert.deepEqual(FT.by[2].docs.map(d => d.file), ['docs/birth-edith-1924.svg', 'docs/photo-ashworths-1950.svg', 'docs/recipes-edith.pdf']);

  const arthur = FT.detailHtml(15, 2026);
  assert.match(arthur, /Earliest generation shown/);
  assert.match(arthur, /Sample/);
  assert.match(arthur, /George Ashworth/);

  const joan = FT.detailHtml(5, 2026);
  assert.match(joan, /Owen Pryce/);
  assert.match(joan, /Gwen Pryce/);
  assert.match(joan, /Spouse/);
});

test('mobile branch sections keep every person and show maternal and partner links', () => {
  const sections = FT.branchSections();
  assert.deepEqual(sections.map(s => s.branch), ['ashworth', 'hale', 'doyle', 'pryce', 'iyer', 'chen']);
  const seen = [];
  sections.forEach(s => {
    assert.match(s.label, /paternal|maternal|partner/);
    assert.ok(s.members.length >= 3);
    seen.push(...s.members);
    if (s.kind === 'maternal') assert.match(s.blurb, /Maternal/);
    if (s.kind === 'partner') assert.match(s.blurb, /[Pp]artner|Maternal line/);
  });
  assert.deepEqual(seen.slice().sort((a, b) => a - b), FT.people.map(p => p.id).sort((a, b) => a - b));

  const hale = sections.find(s => s.branch === 'hale');
  assert.ok(hale.related.some(r => r.id === 1 && /Married to Walter/.test(r.label)));
  assert.ok(hale.related.some(r => r.id === 3));
  assert.ok(hale.related.some(r => r.id === 5));

  const iyer = sections.find(s => s.branch === 'iyer');
  assert.match(iyer.blurb, /Oliver and Isla/);
  assert.ok(iyer.related.some(r => r.id === 12));
  assert.ok(iyer.related.some(r => r.id === 13));

  const chen = sections.find(s => s.branch === 'chen');
  assert.ok(chen.related.some(r => r.id === 14));
  const pryce = sections.find(s => s.branch === 'pryce');
  assert.ok(pryce.members.includes(6));
  assert.ok(pryce.members.includes(24));
  assert.ok(pryce.members.includes(14));
});

test('a laptop shows the whole tree and a phone-width fit stays inside the screen', () => {
  const laid = FT.layoutTree();
  const desktop = FT.fitScale(laid.width, laid.height, 1280, 800);
  assert.ok(desktop > 0.42, 'desktop fit ' + desktop);
  assert.ok(laid.width * desktop <= 1280);
  assert.ok(laid.height * desktop <= 800);
  const phone = FT.fitScale(laid.width, laid.height, 390, 700);
  assert.ok(phone > 0);
  assert.ok(phone < 1);
  assert.ok(laid.width * phone <= 390);
});

test('former partners, step and adoptive links, and half-siblings are named and nobody is dropped', () => {
  const walter = Object.assign({}, FT.by[1], {
    formerPartners: [20],
    halfSiblingIds: [17],
    partnerIds: [2]
  });
  const html = FT.buildDetail(walter, 2026, id => FT.by[id]);
  assert.match(html, /Former partners/);
  assert.match(html, /Lydia Hale/);
  assert.match(html, /not a current spouse, and not a blood line/);
  assert.match(html, /Half-siblings/);
  assert.match(html, /George Ashworth/);
  assert.match(html, /shares one biological parent/);
  assert.ok(html.indexOf('Former partners') < html.indexOf('>Father<'), 'former partners stay with the visible details');
  assert.match(html, /Birth certificate/);

  const mapped = FT.fromApproved({
    people: [
      { id: 1, displayName: 'Walter Ashworth', sex: 'm', born: 1921, notes: 'Carpenter from Ballarat.', documents: [{ id: 9, caption: 'Will (PDF)', contentType: 'application/pdf' }] },
      { id: 2, displayName: 'Helen Crowe', sex: 'f', born: 1926, notes: '' },
      { id: 8, displayName: 'Edith Ashworth', sex: 'f', born: 1924, notes: '' },
      { id: 3, displayName: 'Harold Ashworth', sex: 'm', born: 1948, notes: '', halfSiblings: [{ personId: 6 }] },
      { id: 6, displayName: 'Ruth Ashworth', sex: 'f', born: 1954, notes: '' },
      { id: 40, displayName: 'Ada Example', sex: 'f', born: 1955, notes: '' }
    ],
    relationships: [
      { fromId: 1, toId: 8, kind: 'partner' },
      { fromId: 1, toId: 2, kind: 'partner_former' },
      { fromId: 2, toId: 1, kind: 'partner_former' },
      { fromId: 2, toId: 3, kind: 'parent_step' },
      { fromId: 1, toId: 3, kind: 'parent_biological' },
      { fromId: 8, toId: 3, kind: 'parent_biological' },
      { fromId: 1, toId: 6, kind: 'parent_biological' },
      { fromId: 16, toId: 40, kind: 'parent_adoptive' }
    ]
  });
  const seen = new Set(mapped.canvas.concat(mapped.aside).map(person => person.id));
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 6, 8, 40]);
  assert.equal(mapped.canvas.some(person => person.id === 6), false);
  assert.equal(mapped.canvas.some(person => person.id === 2), false);
  assert.equal(mapped.canvas.some(person => person.id === 40), false);
  assert.ok(mapped.aside.some(person => person.id === 6 && /One biological parent/.test(person.reason)));
  const helenAside = mapped.aside.find(person => person.id === 2);
  assert.match(helenAside.reason, /Former partner/);
  assert.match(helenAside.reason, /Step relationship/);
  const find = id => mapped.directory[id];
  const approvedWalter = FT.buildDetail(mapped.directory[1], 2026, find);
  assert.equal(mapped.directory[1].spouse, 8);
  assert.deepEqual(mapped.directory[1].formerPartners, [2]);
  assert.match(approvedWalter, /Former partners/);
  assert.match(approvedWalter, /Helen Crowe/);
  assert.match(approvedWalter, /Will \(PDF\)/);
  assert.match(approvedWalter, /\/api\/files\/9/);
  assert.doesNotMatch(approvedWalter, /Former partners:[\s\S]*Edith Ashworth — not a current spouse/);
  const harold = FT.buildDetail(mapped.directory[3], 2026, find);
  assert.match(harold, /Step parents/);
  assert.match(harold, /Helen Crowe/);
  assert.match(harold, /not drawn as a biological parent/);
  assert.match(harold, /Half-siblings/);
  assert.match(harold, /Ruth Ashworth/);
  assert.equal(mapped.directory[3].parents.includes(2), false);
  const helen = FT.buildDetail(mapped.directory[2], 2026, find);
  assert.match(helen, /Step children/);
  assert.match(helen, /Harold Ashworth/);
  const ada = FT.buildDetail(mapped.directory[40], 2026, find);
  assert.match(ada, /Adoptive parents/);
  assert.match(ada, /Person 16/);
  const walterKids = mapped.directory[1].biologicalChildIds.slice().sort();
  assert.deepEqual(walterKids, [3, 6]);
  assert.match(approvedWalter, /Ruth Ashworth/);
});

test('the page keeps a phone layout, pan/zoom, and the document lightbox hooks', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /viewport/);
  assert.match(html, /max-width:\s*760px/);
  assert.match(html, /branch-stack/);
  assert.match(html, /Fit all/);
  assert.match(html, /data-doc/);
  assert.match(html, /#lb/);
  assert.match(html, /#demo-doc/);
  assert.match(html, /touch-action:\s*none/);
  assert.match(html, /<section id="aside"/);
  assert.match(html, /#d\{[^}]*overflow:\s*auto/);
  // Salon holding-page rules are not part of this folder.
  assert.doesNotMatch(html, /RewriteRule/);
});
