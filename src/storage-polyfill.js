// O app foi feito dentro do Claude, que oferece um "window.storage" pronto.
// Fora do Claude esse objeto não existe, então recriamos ele aqui usando o
// localStorage do próprio navegador. A "forma" (get/set/delete/list) é igual,
// então o resto do app (App.jsx) não precisa de nenhuma alteração.
//
// IMPORTANTE: localStorage é por aparelho/navegador. Ou seja, um token criado
// no celular de uma pessoa só funciona nesse mesmo celular/navegador. Se no
// futuro você quiser que o mesmo token funcione em qualquer aparelho, dá pra
// trocar este arquivo por uma versão que fala com um banco de dados real
// (ex: Supabase).

function fullKey(key, shared) {
  return `mc:${shared ? "shared" : "local"}:${key}`;
}

window.storage = {
  async get(key, shared = false) {
    const raw = localStorage.getItem(fullKey(key, shared));
    if (raw === null) throw new Error(`Chave não encontrada: ${key}`);
    return { key, value: raw, shared };
  },
  async set(key, value, shared = false) {
    localStorage.setItem(fullKey(key, shared), value);
    return { key, value, shared };
  },
  async delete(key, shared = false) {
    localStorage.removeItem(fullKey(key, shared));
    return { key, deleted: true, shared };
  },
  async list(prefix = "", shared = false) {
    const base = fullKey(prefix, shared);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(base)) keys.push(k.slice(fullKey("", shared).length));
    }
    return { keys, prefix, shared };
  },
};
