// Clears the session cookie and returns to the login screen.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', 'aff_s=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  res.statusCode = 303;
  res.setHeader('Location', '/login.html');
  res.end();
};
