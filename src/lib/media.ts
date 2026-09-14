export function mediaMime(bytes:Uint8Array,declared:string):string|undefined{
  const starts=(values:number[])=>values.every((v,i)=>bytes[i]===v);
  const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
  if(starts([255,216,255]))return 'image/jpeg';
  if(starts([137,80,78,71,13,10,26,10]))return 'image/png';
  if(['GIF87a','GIF89a'].includes(ascii(0,6)))return 'image/gif';
  if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
  if(ascii(4,8)==='ftyp'&&['avif','avis'].includes(ascii(8,12)))return 'image/avif';
  if(ascii(4,8)==='ftyp'&&declared==='video/mp4')return declared;
  if(starts([26,69,223,163])&&declared==='video/webm')return declared;
  if((ascii(0,3)==='ID3'||starts([255,251]))&&declared==='audio/mpeg')return declared;
  if(ascii(0,4)==='OggS'&&declared==='audio/ogg')return declared;
  if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE'&&declared==='audio/wav')return declared;
  return;
}
