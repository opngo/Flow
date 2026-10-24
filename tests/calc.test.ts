import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/pages/ToolHost';

describe('calculator parser', () => {
  it('respects precedence and associativity', () => {
    expect(evaluate('2+3*4')).toBe(14);
    expect(evaluate('(2+3)*4')).toBe(20);
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('-5+3')).toBe(-2);
    expect(evaluate('10%3')).toBe(1);
  });

  it('supports functions and constants', () => {
    expect(evaluate('sqrt(16)')).toBe(4);
    expect(evaluate('sin(pi/2)')).toBeCloseTo(1);
    expect(evaluate('ln(e)')).toBeCloseTo(1);
    expect(evaluate('log(1000)')).toBeCloseTo(3);
  });

  it('refuses anything that is not arithmetic', () => {
    expect(() => evaluate('alert(1)')).toThrow();
    expect(() => evaluate('process.exit()')).toThrow();
    expect(() => evaluate('2+')).toThrow();
    expect(() => evaluate('1/0')).toThrow();
  });
});
