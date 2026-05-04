<div align="center">
    <img src="images/frappe-icon.png" height="128">
    <h2>Frappe Script Editor</h2>
    <p>Edit Frappe doctype script fields directly in VS Code with live sync on save</p>
</div>

## Features

- **Edit Scripts in VS Code:** — Edit JavaScript, Python, HTML, and CSS scripts of Frappe doctypes
- **Live Sync on Save** — Changes automatically sync back to your Frappe site when you save
- **Multi-Site Support** — Manage and switch between multiple Frappe sites


## Installation

```bash
git clone https://github.com/frappe/frappe-script-editor.git
cd frappe-script-editor
yarn install
yarn compile
```
Then copy the extension folder to your VS Code extensions directory.

```bash
cp -r frappe-script-editor ~/.vscode/extensions
# Restart VS Code
```


## Setup

### 1. Generate API Credentials in Frappe

1. Login to your Frappe site
2. Go to **User** > **Your User** > **API Access**
3. Generate a new API Key and API Secret
4. Save these credentials securely

### 2. Add Your Site in VS Code:

1. Open the **Frappe Script Editor** sidebar (click the Frappe icon in the Activity Bar)
2. Click **"Add Site"**
3. Enter:
   - **Site Name** — A friendly name for your site
   - **Site URL** — Your Frappe site URL (e.g., `https://your-site.com`)
   - **API Key** — The key generated above
   - **API Secret** — The secret generated above
4. Click **Add Site**


## Usage

### Browsing and Editing Scripts

1. Expand your connected site in the **Frappe Script Editor** sidebar
2. Click any script to open it in the editor
3. Make your changes and **Save** (`Cmd/Ctrl + S`)
4. Changes are automatically synced to your Frappe site

## License

AGPL-3.0 license — see [license.txt](license.txt) for details.


## Support

- **Issues:** [GitHub Issues](https://github.com/frappe/frappe-script-editor/issues)
- **Discussions:** [GitHub Discussions](https://github.com/frappe/frappe-script-editor/discussions)
- **Frappe Community:** [discuss.frappe.io](https://discuss.frappe.io)