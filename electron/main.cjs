const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const core = require('./videocat-core.cjs');

const APP_TITLE='VideoCat 视频压缩猫';
const APP_ID='com.meowbuild.videocat';

function createWindow(){
  const win=new BrowserWindow({
    title:APP_TITLE,width:1200,height:880,minWidth:920,minHeight:700,
    backgroundColor:'#f7f2e8',
    icon:path.join(__dirname,'..','build','icon.ico'),
    autoHideMenuBar:true,show:false,
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true
    }
  });
  win.loadFile(path.join(__dirname,'..','index.html'));
  win.once('ready-to-show',()=>win.show());
  win.webContents.setWindowOpenHandler(({url})=>{
    if(/^https?:/i.test(url)) shell.openExternal(url);
    return {action:'deny'};
  });
}

ipcMain.handle('videocat:choose-videos',async()=>{
  const r=await dialog.showOpenDialog({
    title:'选择要压缩的视频',
    properties:['openFile','multiSelections'],
    filters:[{name:'视频',extensions:['mp4','mov','mkv','avi','webm','m4v','wmv','flv','mpeg','mpg','ts','mts','m2ts']}]
  });
  return r.canceled?[]:r.filePaths;
});

ipcMain.handle('videocat:choose-output-dir',async()=>{
  const r=await dialog.showOpenDialog({title:'选择输出文件夹',properties:['openDirectory','createDirectory']});
  return r.canceled?null:r.filePaths[0];
});

ipcMain.handle('videocat:suggest-output-dir',(_e,filePath)=>{
  return path.join(path.dirname(filePath),'VideoCat_压缩结果');
});

ipcMain.handle('videocat:inspect-videos',async(_e,files)=>{
  const out=[];
  for(const f of files){
    try{out.push({ok:true,...await core.inspectVideo(f)});}
    catch(err){out.push({ok:false,path:f,name:path.basename(f),error:err.message});}
  }
  return out;
});

ipcMain.handle('videocat:compress',async(event,payload)=>{
  return core.compressBatch(payload.files,payload.outputDir,payload.options,progress=>{
    event.sender.send('videocat:progress',progress);
  });
});

ipcMain.handle('videocat:reveal-file',async(_e,filePath)=>{
  shell.showItemInFolder(filePath); return true;
});

const lock=app.requestSingleInstanceLock();
if(!lock) app.quit();
else{
  app.on('second-instance',()=>{const w=BrowserWindow.getAllWindows()[0];if(w){if(w.isMinimized())w.restore();w.focus();}});
  app.whenReady().then(()=>{
    app.setAppUserModelId(APP_ID);
    createWindow();
    app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
  });
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
