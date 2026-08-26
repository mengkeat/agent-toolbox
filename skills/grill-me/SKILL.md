name: grill-me
description: Interview the user relentlessly about a plan or design, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
disable-model-invocation: true
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Present all the questions at once in the form of a list of questions, with each questions followed by a list of possible answers, and your recommended answer highlighted. For example:

1. What database should we use?
   a. MySQL (Recommended)
   b. PostgreSQL
   c. MongoDB    

If a question can be answered by exploring the codebase, explore the codebase instead.

If the plan or design originates from a file, append the entire list of questions , choices and recommended answers to the end of the
same file.  I will then go through the questions one-by-one on my own to answer them. Before we start iterating on the next round.
