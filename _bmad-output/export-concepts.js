const{PrismaClient}=require('@prisma/client');
const fs=require('fs');
const p=new PrismaClient();
p.concept.findMany({select:{id:true,name:true,definition:true},orderBy:{id:'asc'}}).then(c=>{
  fs.writeFileSync(__dirname+'/concepts-to-translate.json',JSON.stringify(c));
  console.log('Exported',c.length,'concepts');
  const serbian=c.filter(x=>/[čćžšđČĆŽŠĐ]/.test(x.name));
  console.log('With Serbian chars:',serbian.length);
  return p.$disconnect();
});
