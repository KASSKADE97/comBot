const puppeteer = require('puppeteer');

class Html2Pdf {
    /**
     * @param {Object} params
     * @param {string} [params.html] If set, skips loading the page and replaces
     *     it's content with given html string.
     * @param {string} params.url If params.html is set, the url is only used for 
     *     external resources in html.
     * @param {import('@types/puppeteer').PDFOptions} pdfOptions
     * @returns {Buffer} PDF file binary data
     */
    static async render({ html, url }, pdfOptions) {
        await this._launch();
        
        const page = await this.browser.newPage();
        if (html) {
            await page.setRequestInterception(true);

            page.once('request', (request) => {
                request.respond({ body: html });
                page.on('request', request => request.continue());
            });
        }
            
        await page.goto(url, { waitUntil: 'networkidle0' });
        
        const buffer = await page.pdf(pdfOptions);

        await page.close();

        return buffer;
    }

    /**
     * Launches browser instance
     */
    static async _launch() {
        if (this.browser) return this.browser;

        this.browser = await puppeteer.launch({
            args: ['--no-sandbox', '--headless', '--disable-gpu'],
        });
    }
}

module.exports = Html2Pdf;