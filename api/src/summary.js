/* Turns the flat label map into something a person can read.
 *
 * The browser sends `labels` as { "children.0.first": { label, step, display } }.
 * Object key order follows the order the fields were registered, which is the
 * order they appear on the form, so walking the keys is enough to preserve the
 * shape of the original paper form. Repeat blocks get split back out, otherwise
 * a household with three children produces "First name" three times with no way
 * to tell whose is whose.
 */

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* children -> Child, adults -> Adult. Crude, and right for every repeat block
 * these forms use. A block that needs something else can be special-cased. */
const singular = (key) => {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  if (words.endsWith('ren')) return titleCase(words.slice(0, -3)); // children
  if (words.endsWith('ies')) return titleCase(`${words.slice(0, -3)}y`);
  if (words.endsWith('s')) return titleCase(words.slice(0, -1));
  return titleCase(words);
};

function subgroupFor(path) {
  const match = path.match(/^(.*?)\.(\d+)\./);
  if (!match) return null;
  return `${singular(match[1].split('.').pop())} ${Number(match[2]) + 1}`;
}

export function sections(labels) {
  const out = [];
  const bySection = new Map();

  for (const path of Object.keys(labels)) {
    const entry = labels[path];
    const display = String(entry.display ?? '').trim();
    if (!display) continue;

    const title = entry.step || 'Answers';
    if (!bySection.has(title)) {
      const section = { title, groups: [], _byName: new Map() };
      bySection.set(title, section);
      out.push(section);
    }
    const section = bySection.get(title);

    const name = subgroupFor(path);
    const groupKey = name || '';
    if (!section._byName.has(groupKey)) {
      const group = { subtitle: name, rows: [] };
      section._byName.set(groupKey, group);
      section.groups.push(group);
    }
    section._byName.get(groupKey).rows.push({ label: entry.label || path, value: display });
  }

  return out.map((s) => ({ title: s.title, groups: s.groups }));
}

/* Depth-first search for a key, used to pull the submitter's email and surname
 * out of answers whose shape differs from one form to the next. */
export function findFirst(data, key) {
  if (data === null || typeof data !== 'object') return undefined;
  if (!Array.isArray(data) && typeof data[key] === 'string' && data[key].trim()) {
    return data[key].trim();
  }
  const children = Array.isArray(data) ? data : Object.keys(data).map((k) => data[k]);
  for (const child of children) {
    const hit = findFirst(child, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function submitterEmail(data) {
  const candidate = findFirst(data, 'email');
  return candidate && EMAIL.test(candidate) ? candidate : null;
}

/* "Kowalski Household" reads better in a subject line than a reference number,
 * and it is what the office will sort by. */
export function subjectName(data, signatures) {
  const last = findFirst(data, 'last');
  if (last) return `${last} Household`;
  const typed = signatures[0] && signatures[0].value.typedName;
  return typed ? String(typed).trim() : 'New submission';
}
