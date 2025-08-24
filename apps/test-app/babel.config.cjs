module.exports = {
  plugins: [
    [
      'babel-plugin-jsx-dom-expressions',
      {
        moduleName: "atomic-duck",
        //delegateEvents: true,
        //wrapConditionals: true,
      },
    ],
  ],
};
