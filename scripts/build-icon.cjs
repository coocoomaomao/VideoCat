const fs=require('fs');
const path=require('path');
const sharp=require('sharp');
const mod=require('png-to-ico');
const pngToIco=mod.default||mod;

(async()=>{
  const root=path.join(__dirname,'..');
  const svg=path.join(root,'build','icon.svg');
  const png=path.join(root,'build','icon.png');
  const ico=path.join(root,'build','icon.ico');
  await sharp(svg).resize(1024,1024).png().toFile(png);
  const frames=[];
  for(const size of [16,24,32,48,64,128,256]) frames.push(await sharp(svg).resize(size,size).png().toBuffer());
  fs.writeFileSync(ico,await pngToIco(frames));
  console.log('Generated VideoCat icon');
})().catch(e=>{console.error(e);process.exit(1)});
