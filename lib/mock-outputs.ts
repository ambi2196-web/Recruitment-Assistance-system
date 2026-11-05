// Canned answers so the whole workflow can run with no AI provider and no data
// leaving the machine. They prove the plumbing only. They say nothing about how
// well a real model would flag ambiguity, so never treat them as evaluation evidence.

const baseCheck = {
  missing_info: [
    { item: "work mode and location", why_it_matters: "It decides where recruiters can source." },
    { item: "contract duration", why_it_matters: "Candidates ask this first." },
    { item: "must-have versus nice-to-have split", why_it_matters: "Without it, recruiters may reject good people." },
    { item: "years of experience", why_it_matters: "It sets the seniority to target." },
    { item: "interview process", why_it_matters: "Candidates need to plan their time." },
    { item: "start date", why_it_matters: "It rules out people on long notice." },
    { item: "visa or work authorisation", why_it_matters: "It can rule out whole candidate groups." },
  ],
  confidence: "medium",
  confidence_reason: "Mock answer. No real model was used.",
};

const ontologyCheck = {
  ...baseCheck,
  summary: [
    "The client wants help with a semantic layer and a knowledge model.",
    "The word ontology is central, but its meaning here is unclear.",
    "The real need could be engineering, data modelling or both.",
  ],
  role_family: "Data and knowledge engineering",
  must_haves: ["Understanding of ontology"],
  nice_to_haves: ["Experience with data platforms"],
  ambiguous_terms: [
    {
      term: "ontology",
      possible_meanings: [
        "Building software for knowledge graphs",
        "Defining business concepts and how they relate",
        "Making data machine-readable with a formal model",
      ],
      profile_each_implies: ["Ontology engineer", "Ontologist or taxonomist", "Technical ontologist"],
    },
  ],
  client_questions: [
    "Do you need someone to build software, define business concepts, or make your data machine-readable?",
    "Which tools or standards does your team use today, such as OWL, RDF or SHACL?",
    "Who will this person work with day to day, and what will they deliver first?",
  ],
};

const networkCheck = {
  ...baseCheck,
  summary: [
    "The client needs a network access control engineer.",
    "The role names an older product, Cisco Clean Access.",
    "It may need a person who can move to a newer product.",
  ],
  role_family: "Network security",
  must_haves: ["Cisco Clean Access", "802.1X", "RADIUS", "Switch port security"],
  nice_to_haves: [],
  ambiguous_terms: [
    {
      term: "Cisco Clean Access",
      possible_meanings: ["Support the existing older product", "Migrate to a newer access control product"],
      profile_each_implies: ["Support engineer", "Migration engineer"],
    },
  ],
  client_questions: [
    "Will this person support Cisco Clean Access as it is, or migrate it to a newer product?",
    "Is Houston a firm requirement, or would you accept remote work?",
    "How many sites and users does the access control system cover?",
  ],
};

const dataCheck = {
  ...baseCheck,
  summary: [
    "The client needs a data engineer on a cloud data platform.",
    "The email lists tools but says nothing about the project.",
    "Remote work may be possible, but this is not confirmed.",
  ],
  role_family: "Data engineering",
  must_haves: ["Python", "SQL", "Spark", "Snowflake", "Airflow", "AWS"],
  nice_to_haves: [],
  ambiguous_terms: [],
  client_questions: [
    "Which of Python, SQL, Spark, Snowflake, Airflow and AWS are true must-haves?",
    "Is this role fully remote, and are there location limits?",
    "What will this person build in their first three months?",
  ],
};

const baseBrief = {
  adjacent_job_titles: [] as string[],
  target_companies: [] as { name: string; why: string }[],
  hindi_lines: { project_story: "यह नमूना उत्तर है। कोई असली मॉडल उपयोग नहीं हुआ।" },
  confidence: "medium",
};

function ontologyBrief(answered: boolean) {
  return {
    ...baseBrief,
    project_story: answered
      ? [
          "The client wants its operational data to be machine-readable.",
          "This role builds the formal model that makes that possible.",
          "The client confirmed that it needs a technical ontologist.",
        ]
      : [
          "The client is building a semantic layer over its data.",
          "This role shapes the knowledge model behind it.",
          "The exact type of person is still unclear.",
        ],
    must_haves: answered
      ? ["Formal modelling with OWL or RDF", "Making data machine-readable", "Working with data engineers"]
      : ["Understanding of ontology"],
    nice_to_haves: ["Experience with data platforms"],
    tech_lineage: [
      {
        named_in_requirement: "semantic layer",
        current_or_related_names: ["knowledge graph", "metadata layer"],
        plain_explanation: "A shared map of what business data means.",
      },
    ],
    adjacent_job_titles: answered
      ? ["Technical Ontologist", "Knowledge Engineer"]
      : ["Ontology Engineer", "Ontologist", "Knowledge Engineer"],
    linkedin_recruiter_filters: {
      job_titles: answered ? ["Ontologist", "Knowledge Engineer"] : ["Ontology Engineer", "Knowledge Engineer"],
      skills: answered ? ["OWL", "RDF", "SHACL"] : ["Ontology", "Knowledge Graphs"],
      locations: ["United States"],
      years_of_experience: "6-10",
      industries: ["Oil and Energy"],
      companies_to_include: [],
    },
    open_questions: answered ? [] : [ontologyCheck.client_questions[0]],
  };
}

const networkBrief = {
  ...baseBrief,
  project_story: [
    "The client controls which devices can join its network.",
    "It uses an older product for this today.",
    "This role keeps that access control working.",
  ],
  must_haves: networkCheck.must_haves,
  nice_to_haves: [],
  tech_lineage: [
    {
      named_in_requirement: "Cisco Clean Access",
      current_or_related_names: ["Cisco NAC Appliance", "Cisco ISE"],
      plain_explanation: "An older product. Cisco ISE is the newer one.",
    },
  ],
  adjacent_job_titles: ["Network Security Engineer", "ISE Engineer"],
  linkedin_recruiter_filters: {
    job_titles: ["Network Security Engineer"],
    skills: ["Cisco ISE", "802.1X", "RADIUS"],
    locations: ["Houston, Texas"],
    years_of_experience: "6-10",
    industries: ["Oil and Energy"],
    companies_to_include: [],
  },
  open_questions: [networkCheck.client_questions[0]],
};

const dataBrief = {
  ...baseBrief,
  project_story: [
    "The client runs a cloud data platform.",
    "This role builds and looks after data pipelines.",
    "The project details are not known yet.",
  ],
  must_haves: dataCheck.must_haves,
  nice_to_haves: [],
  tech_lineage: [
    {
      named_in_requirement: "Airflow",
      current_or_related_names: ["Apache Airflow"],
      plain_explanation: "A tool that schedules data jobs.",
    },
  ],
  adjacent_job_titles: ["Analytics Engineer", "Data Platform Engineer"],
  linkedin_recruiter_filters: {
    job_titles: ["Data Engineer"],
    skills: dataCheck.must_haves,
    locations: ["United States"],
    years_of_experience: "7-10",
    industries: ["Mining and Metals"],
    companies_to_include: [],
  },
  open_questions: [dataCheck.client_questions[0]],
};

export function mockOutput(agent: string, input: string): unknown {
  const isOntology = /ontolog/i.test(input);
  const isNetwork = /network access control/i.test(input);

  switch (agent) {
    case "a1_requirement_check":
      return isOntology ? ontologyCheck : isNetwork ? networkCheck : dataCheck;
    case "a2_recruiter_brief":
      if (isOntology) return ontologyBrief(input.includes("<<<CLIENT_ANSWER"));
      return isNetwork ? networkBrief : dataBrief;
    default:
      return { status: "ok", characters_received: input.length };
  }
}
