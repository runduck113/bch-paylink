import { describe, it, expect } from 'vitest';
import { truncateMiddle } from './format';

describe('truncateMiddle', () => {
  it('drops the prefix and keeps both ends of a cashaddr', () => {
    expect(truncateMiddle('bitcoincash:zz8l22vpcx037klsqha3jzqq8lsnx4jkryzf0mhn77')).toBe('zz8l22vp…zf0mhn77');
  });
  it('keeps the last 8 characters, the part people compare', () => {
    const body = 'qqqszqgpqyqszqgpqyqszqgpqyqszqgpqy8kvl0kqa';
    expect(truncateMiddle('bchtest:' + body).endsWith(body.slice(-8))).toBe(true);
  });
  it('leaves short values whole', () => {
    expect(truncateMiddle('abc')).toBe('abc');
    expect(truncateMiddle('x:12345678901234567', 8, 8)).toBe('12345678901234567');
  });
});
