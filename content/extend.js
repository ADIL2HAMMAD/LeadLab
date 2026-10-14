/* Extension de la banque : les anciens identifiants restent inchangés. */
window.LEADLAB.addModuleQuestions = (moduleId, prefix, entries, extraQuizzes) => {
  const module = window.LEADLAB.modules.find(m => m.id === moduleId);
  for (const [title, answer, code, pitfall, followup, options, level = 'Intermédiaire'] of entries) {
    const id = prefix + (module.questions.length + 1);
    const paragraphs = answer.split('\n\n');
    module.questions.push({id,title,level,answer:paragraphs,code,pitfall,followup});
    module.quizzes.push({id:prefix+'q'+(module.quizzes.length+1),question:title,options,correct:0,explanation:paragraphs[0]+' À éviter : '+pitfall,ref:id});
  }
  for (const [question,options,explanation,ref] of extraQuizzes) {
    module.quizzes.push({id:prefix+'q'+(module.quizzes.length+1),question,options,correct:0,explanation,ref});
  }
  module.duration = moduleId === 'architecture' ? '180 min' : '150 min';
};
