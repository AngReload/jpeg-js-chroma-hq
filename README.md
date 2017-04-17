# jpeg-js-chroma-hq
Example of reconstruction original size chroma in YCbCr.

The project is basically a decoder from [jpeg-js](https://github.com/eugeneware/jpeg-js) with small additions.

# Comparison
Decoding result with `jpeg-js` vs `jpeg-js-chroma-hq`:

![jpeg-js result](https://raw.github.com/AngReload/jpeg-js-chroma-hq/master/comparison/demo_jpeg-js.png)![jpeg-js-chroma-hq result](https://raw.github.com/AngReload/jpeg-js-chroma-hq/master/comparison/demo_jpeg-js-chroma-hq.png)

#Install

```
npm install jpeg-js-chroma-hq
```

# Example

```javasript
var decode = require('jpeg-js-chroma-hq');
var jpegData = fs.readFileSync('grumpycat.jpg');
var rawImageData = decode(jpegData);
console.log(rawImageData);
/*
{ width: 320,
  height: 180,
  data: <Buffer 5b 40 29 ff 59 3e 29 ff 54 3c 26 ff 55 3a 27 ff 5a 3e 2f ff 5c 3c 31 ff 58 35 2d ff 5b 36 2f ff 55 35 32 ff 5a 3a 37 ff 54 36 32 ff 4b 32 2c ff 4b 36 ... >
}
*/
```

The function takes a raw jpeg and returns an image object.
The image contains the width, height and array of values `[red, green, blue, alpha, red, green ...]`.
RGB is an integer from 0 to 255, and Alpha is always 255.

