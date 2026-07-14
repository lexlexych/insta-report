// Недокументированный, но широко используемый параметр Instagram, форсирующий повторный ввод
// логина/пароля (force_authentication=1); next ведёт сразу в раздел управления доступом
// тестировщиков. Если Instagram параметр проигнорирует — страница просто откроется как обычно.
// Используется и клиентом мини-аппа (мобильная ветка), и шлюзом app/ig-gate — без 'server-only',
// т.к. импортируется в 'use client' компонентах.
export const IG_MANAGE_ACCESS_URL =
  'https://www.instagram.com/accounts/login/?force_authentication=1&next=%2Faccounts%2Fmanage_access%2F';
