alter table tenants
  add column ui_locale text not null default 'de' check (ui_locale in ('ru', 'de'));
