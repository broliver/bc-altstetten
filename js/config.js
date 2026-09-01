// Runtime configuration of the website.
// The deploy workflow overwrites SUPABASE_URL / SUPABASE_ANON_KEY from the
// repository secrets. Leave both empty to preview the site with demo data.
window.BCA_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  // where the LinkUp app is served (same host, see .github/workflows/deploy.yml)
  LINKUP_URL: '/linkup/',
}
