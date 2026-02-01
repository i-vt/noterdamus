const express = require('express');
const path = require('path');
const app = express();

// Allow the port to be set via environment variable
const PORT = process.env.PORT || 4321;

app.use(express.static(path.join(__dirname, '.')));

app.listen(PORT, () => {
    console.log(`PDF Annotator running at http://localhost:${PORT}`);
});
