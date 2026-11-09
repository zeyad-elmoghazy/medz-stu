import { applyDomainSuggestion, suggestEmailDomain } from '@/lib/email-typo';

const hint = (domain: string) => suggestEmailDomain(`student@${domain}`);

describe('suggestEmailDomain', () => {
  // Mistyped domains taken from real signups that never confirmed.
  it.each([
    ['gmail.con', 'gmail.com'],
    ['gmial.com', 'gmail.com'],
    ['gmail', 'gmail.com'],
    ['gmail.co', 'gmail.com'],
    ['yahho.com', 'yahoo.com'],
    ['badya.uni.eg', 'badyauni.edu.eg'],
    ['badya.edu', 'badyauni.edu.eg'],
    ['badyauni.edu', 'badyauni.edu.eg'],
    ['students.kasralainy', 'students.kasralainy.edu.eg'],
    ['students.kasralainy.edu', 'students.kasralainy.edu.eg'],
    ['students.kasralainy.cu.edu', 'students.kasralainy.edu.eg'],
    ['students.kasralainy.cu.eg', 'students.kasralainy.edu.eg'],
    ['my.gcu.du', 'my.gcu.edu'],
  ])('%s -> %s', (typo, expected) => {
    expect(hint(typo)).toBe(expected);
  });

  // Every other domain that appeared in real signups must stay quiet.
  it.each([
    'gmail.com',
    'students.kasralainy.edu.eg',
    'badyauni.edu.eg',
    'icloud.com',
    'yahoo.com',
    'hotmail.com',
    'my.gcu.edu',
    'goldvester.com',
    'moblha.com',
    'necub.com',
    'osjw.com',
    'student.com',
    'cnu.edu',
    'bsunu.edu.eg',
    'ya.ru',
    'mail.com',
  ])('stays quiet for %s', (domain) => {
    expect(hint(domain)).toBeNull();
  });

  it('ignores input without a usable domain', () => {
    expect(suggestEmailDomain('')).toBeNull();
    expect(suggestEmailDomain('no-at-sign')).toBeNull();
    expect(suggestEmailDomain('a@')).toBeNull();
    expect(suggestEmailDomain('a@g')).toBeNull();
  });

  it('applyDomainSuggestion swaps only the domain', () => {
    expect(applyDomainSuggestion('Yusuf.K@gmail.con', 'gmail.com')).toBe('Yusuf.K@gmail.com');
  });
});
