// import createDatabase, { is, request, or, member, none } from 'simple-ql';
const { createServer, is, request, or, member, none } = require('./src/index');

// First, just focus on the structure of your data. Describe your table architecture
var User = {
  pseudo: 'string/25',
  email: 'string/40',
  password: 'binary/64',
  contacts: [User],
  index: {
    email: 'unique/8',
    pseudo: '8',
  }
};

const Comment = {
  content: 'text',
  title: {
    type : 'string',
    length: 60,
    nullable : true,
    defaultValue : null,
  },
  author: User,
  date: 'date',
  lastModification: 'date',
  index : {
    date : '',
    content: 'fulltext',
  }
};

const Feed = {
  participants: [User],
  comments: [Comment],
};

//We need this step to use self-references or cross-references
User.contacts = [User];

const tables = {User, Feed, Comment};

// Provide every configuration detail about your database:
const database = {
  user: 'root',             // the login to access your database
  password: 'password',     // the password to access your database
  type: 'mysql',            // the database type that you wish to be using
  privateKey: 'key',        // a private key that will be used to identify requests that can ignore access rules
  host : 'localhost',       // the database server host
  database: 'simpleql',     // the name of your database
  create : false,            // we require to create the database
};

const login = {
  login: 'email',
  password: 'password',
  salt: null,
  userTable: 'User',
};

/** You can always create your own rules. The parameters are described in the documentation. */
const customRule = ({authId, tableRequest, driver}) => driver.request(database.privateKey, {
  Feed: {
    comments: {
      ...tableRequest,
      set: undefined,
      create: undefined,
      delete: undefined,
    },
    participants: {
      id: undefined,
    }
  },
}).then(result => {
  return result.Feed.participants.includes(authId);
});

const rules = {
  User: {
    email : {
      write : none,         //emails cannot be changed
    },
    password : {
      read : none,          //no one can read the password
    },
    create : none,          //Creation is handled by login middleware. No one should create Users from request.
    delete : is('self'),    //Users can only delete their own profile
    write : is('self'),     //Users can only edit their own profile
    read : or(is('self'), member('contacts')), //Users and their contacts can read the profile data
  },
  Feed : {
    comments: {
      create : member('participants'),  //You need to be a member of the participants of the feed to create messages into the feed
      delete : is('comments.author'),   //Only the author of a message can decide to delete it
    },
    participants: {
      create : none,        //Once the feed is created, no one can add participants
      delete : none,        //Once the feed is created, no one can remove participants
    },
    delete : none,          //No one can delete a feed
    create : request(member('participants')), //Users always need to be a member of the feed they wish to create
    read : member('participants'),            //Only the members of a feed can read its content
    write : none,           //No one can edit a feed once created
  },
  Comment : {
    date : {
      write: none,          //The creation date of a message cannot be changed
    },
    author : {
      write : none,         //The author of a message cannot be changed
    },
    delete : is('author'),  //Only the author of a message can delete it
    create : request(is('author')),   //To create a message, you need to declare yourself as the author
    write : request(is('author')),    //Only the author can edit their messages
    read : customRule                 //Only the feed's participants can read the message content ////FIXME TODO
  }
};

// You can always preprocess the request if some fields requier extra attention
const requestPreprocessing = (req, res, next) => {
  if(!req.body) next();
  const {Comment, Feed} = req.body;
  //We update the `lastModification` field each time a modification happens
  if(Comment && Comment.set) Comment.set.lastModification = new Date();
  //To create a message, the message needs to be associated to an existing feed
  if(Comment && Comment.create) {
    res.writeHead(402);
    res.end('Message creation should always be made through a Feed');
  }
  //Upon creation, we set the fields `date` and `lastModification`.
  if(Feed && Feed.comments && Feed.comments.create) {
    const date = new Date();
    Feed.comments.create.date = date;
    Feed.comments.create.lastModification = date;
  }
  next();
};

module.exports = () => createServer({port : 80, tables, login, database, rules, middlewares: [requestPreprocessing]});
