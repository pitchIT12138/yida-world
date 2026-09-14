<script lang="ts">
  let {name,size=18}:{name:string;size?:number}=$props();
  const paths:Record<string,string>={
    search:'m21 21-4.35-4.35 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    edit:'m16 3 5 5-12 12-6 1 1-6L16 3 M14 5l5 5',
    comment:'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z',
    bookmark:'M6 3h12v19l-6-4-6 4V3Z',
    share:'M18 8V3l-7 7 7 7v-5c-8-1-12 2-14 7 0-8 5-12 14-11Z',
    arrow:'M5 12h14m-6-6 6 6-6 6',
    chevron:'m6 9 6 6 6-6',
    play:'m8 4 12 8-12 8V4Z',
    close:'m6 6 12 12M6 18 18 6',
    check:'m4 12 5 5L20 6',
    refresh:'M20 7V2l-3 3a8 8 0 1 0 3 12 M20 2h-5',
    upload:'M12 16V3m-5 5 5-5 5 5 M3 16v5h18v-5',
    download:'M12 3v13m-5-5 5 5 5-5 M3 17v4h18v-4',
    bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M9 21h6',
    clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    leaf:'M20 3C8 2 2 9 5 16c4 9 15 2 15-13 M4 21 15 9',
    layers:'m12 3 10 5-10 5L2 8l10-5 M2 12l10 5 10-5 M2 16l10 5 10-5',
    external:'M14 3h7v7m0-7L10 14 M10 3H3v18h18v-7'
  };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name]||paths.leaf}/></svg>
