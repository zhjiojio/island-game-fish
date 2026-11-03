/**
 * jest.config.js — 单测配置
 * 说明：
 *   本项目源码均为浏览器全局脚本（IIFE 挂 window.X），没有 ES module export，
 *   测试用 jsdom 环境模拟 window/localStorage，测试文件里用 require() 直接
 *   加载源文件（执行副作用后从 global 上取对象），不改动任何生产代码。
 */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/unit/**/*.test.js'],
  verbose: true
};
