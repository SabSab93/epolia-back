export function normalizeSchoolSearch(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function schoolSearchKey(label: string, city: string, uai: string) {
  const name = normalizeSchoolSearch(label);
  const alias = name.startsWith('mydigitalschool')
    ? name.replace('mydigitalschool', 'mds')
    : '';
  return [
    name,
    normalizeSchoolSearch(city),
    normalizeSchoolSearch(uai),
    alias,
  ].join(' ');
}
