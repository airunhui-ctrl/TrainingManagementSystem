/// <reference path="./globals.d.ts" />
import { hashPassword, passwordMatches } from '../src/prisma.service'

describe('密码哈希', () => {
  test('scrypt 哈希使用随机盐并可安全校验', () => {
    const first = hashPassword('123456')
    const second = hashPassword('123456')
    expect(first).not.toBe(second)
    expect(passwordMatches('123456', first)).toBe(true)
    expect(passwordMatches('654321', first)).toBe(false)
  })
})
