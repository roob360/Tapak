// Pilih berkas dari perangkat.
export const pickFiles = (accept, multiple = false) => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.onchange = () => resolve([...input.files]);
  input.oncancel = () => resolve([]);
  input.click();
});
