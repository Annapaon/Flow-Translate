/**
 * DOM event dispatched by the MAIN-world route watcher whenever an SPA
 * changes the URL via history.pushState/replaceState. Listened to by the
 * isolated-world UI script, which closes the trigger dot and overlay.
 */
export const ROUTE_CHANGE_EVENT = "flow-translate:routechange";

/**
 * Sensitive-site types the default blacklist must cover (plan §9.2):
 * password managers, payment platforms, and online-banking portals.
 * Entries match the domain and all of its subdomains; users can adjust the
 * list in settings. Deliberately over-inclusive — translation is disabled on
 * the whole domain, which is the safe side for sites that may display
 * account balances, credentials, or personal financial data.
 */
export const DEFAULT_BLOCKED_SITES: string[] = [
  // 密码管理器 / password managers
  "my.1password.com",
  "vault.bitwarden.com",
  "lastpass.com",
  "dashlane.com",
  "keepersecurity.com",
  // 支付平台 / payment platforms
  "alipay.com",
  "tenpay.com",
  "paypal.com",
  // 银行网银 / online banking (CN)
  "icbc.com.cn",
  "boc.cn",
  "ccb.com",
  "abchina.com",
  "bankcomm.com",
  "cmbchina.com",
  "cmbc.com.cn",
  "spdb.com.cn",
  "cib.com.cn",
  "cebbank.com",
  "psbc.com",
  // 银行网银 / online banking (international)
  "chase.com",
  "wellsfargo.com",
  "bankofamerica.com",
  "hsbc.com"
];
