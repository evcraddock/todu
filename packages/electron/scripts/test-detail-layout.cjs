const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

app.on("window-all-closed", () => {});

const css = readFileSync(path.join(__dirname, "../src/renderer/styles.css"), "utf8");

function fixture(expanded) {
  return `<style>${css}</style>
    <div class="app-layout"><main class="content-area">
      <div class="entity-detail-view">
        <div class="detail-page-header">
          <div class="detail-toolbar"><button>Back</button></div>
          <div class="detail-title-row"><h2>Task detail layout regression</h2></div>
          <section class="detail-properties">
            <div class="detail-property-grid">
              ${["Status", "Priority", "Project"].map((label) => `<label class="list-filter-field">${label}<select class="filter-select"><option>Active</option></select></label>`).join("")}
            </div>
            <div class="detail-date-grid">
              ${["Scheduled", "Due"].map((label) => `<label class="list-filter-field">${label} date<input type="date" class="input"><span class="detail-property-hint">Task date hint.</span></label>`).join("")}
            </div>
            ${expanded ? '<div style="height:500px">Expanded labels editor</div>' : ""}
            <button id="last-property">Add labels</button>
          </section>
        </div>
        <div class="detail-page-content"><div class="detail-tabs">
          <div class="tab-bar"><button>Description</button><button>Comments</button><button>Assignees</button></div>
          <div class="detail-tab-content">
            ${Array.from({ length: 100 }, (_, index) => `<p>Long description paragraph ${index}</p>`).join("")}
            <button id="last-content">End of description</button>
          </div>
        </div></div>
        <div class="detail-meta"><span>Created: Oct 23, 2026, 12:00 PM</span><span>Updated: Oct 23, 2026, 12:00 PM</span><span class="detail-id-copy">task-example</span></div>
      </div>
    </main></div>`;
}

app.whenReady().then(async () => {
  for (const [width, height, expanded] of [
    [800, 600, false],
    [1200, 600, false],
    [1440, 1000, false],
    [1440, 900, true],
  ]) {
    const window = new BrowserWindow({ width, height, useContentSize: true, show: false });
    try {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fixture(expanded))}`);
      const result = await window.webContents.executeJavaScript(`(() => {
        const page = document.querySelector('.entity-detail-view');
        const header = document.querySelector('.detail-page-header');
        const content = document.querySelector('.detail-page-content');
        const footer = document.querySelector('.detail-meta');
        const tabs = document.querySelector('.tab-bar');
        const inside = (element, container) => {
          const rect = element.getBoundingClientRect();
          const bounds = container.getBoundingClientRect();
          return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
        };
        const footerTop = footer.getBoundingClientRect().top;
        header.scrollTop = header.scrollHeight;
        content.scrollTop = content.scrollHeight;
        return {
          contentHeight: content.clientHeight,
          headerScrolls: header.scrollHeight > header.clientHeight,
          lastPropertyReachable: inside(document.querySelector('#last-property'), header),
          lastContentReachable: inside(document.querySelector('#last-content'), content),
          tabsVisible: inside(tabs, content),
          footerVisible: inside(footer, page),
          footerStays: footerTop === footer.getBoundingClientRect().top,
          outerScrolls: document.querySelector('.content-area').scrollHeight > document.querySelector('.content-area').clientHeight,
        };
      })()`);
      const scenario = `${width}×${height}, expanded=${expanded}`;
      assert.ok(result.contentHeight >= 120, `${scenario}: reserve usable content height`);
      for (const key of ["lastPropertyReachable", "lastContentReachable", "tabsVisible", "footerVisible", "footerStays"]) {
        assert.ok(result[key], `${scenario}: ${key}`);
      }
      assert.equal(result.outerScrolls, false, `${scenario}: avoid clipping outside the detail view`);
      assert.equal(result.headerScrolls, width <= 850 || expanded, `${scenario}: scroll the header only when needed`);
      console.log(`PASS ${scenario}`);
    } finally {
      window.destroy();
    }
  }
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
