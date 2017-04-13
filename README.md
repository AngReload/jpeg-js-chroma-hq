# jpeg-js-chroma-hq
Example of reconstruction original size chroma in YCbCr.

The project is basically a decoder from [jpeg-js](https://github.com/eugeneware/jpeg-js) with small additions.

```javasript
var decoder = require('jpeg-js-chroma-hq');
var jpegData = fs.readFileSync('grumpycat.jpg');
var rawImageData = decoder(jpegData);
console.log(jpegData.data);
/*
{ width: 320,
  height: 180,
  data: <Buffer 5b 40 29 ff 59 3e 29 ff 54 3c 26 ff 55 3a 27 ff 5a 3e 2f ff 5c 3c 31 ff 58 35 2d ff 5b 36 2f ff 55 35 32 ff 5a 3a 37 ff 54 36 32 ff 4b 32 2c ff 4b 36 ... > }
*/
```